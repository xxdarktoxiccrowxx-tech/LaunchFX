const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { helperResult, helperFailure } = require('../src/main/platform.cjs');

const sourceFile = path.resolve(__dirname, '../src/main/platform.cjs');
const actualRequire = createRequire(sourceFile);
function windowsPlatform({ files = [], unified = [], store = null, qa = false } = {}) {
  const fileSet = new Set(files.map(x => x.toLowerCase()));
  const filesystem = { ...fs, existsSync: candidate => fileSet.has(candidate.toLowerCase()), statSync: candidate => {
    if (!fileSet.has(candidate.toLowerCase())) throw Object.assign(new Error('Missing fixture'), { code: 'ENOENT' });
    return { isFile: () => true, isDirectory: () => false };
  } };
  const sandbox = {
    require: name => name === 'node:fs' ? filesystem : name === 'node:path' ? path.win32 : actualRequire(name),
    __dirname: path.win32.dirname(sourceFile), module: { exports: {} }, Buffer,
    process: { ...process, platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\Tester\\AppData\\Local', ProgramFiles: 'C:\\Program Files' } }
  };
  vm.runInNewContext(fs.readFileSync(sourceFile, 'utf8'), sandbox, { filename: sourceFile });
  const platform = new sandbox.module.exports.Platform({ app: {}, shell: {}, qa, nativeDirectory: 'C:\\LaunchFX\\native', dataDirectory: 'C:\\LaunchFX\\data' });
  const calls = [];
  platform.windows = async (action, payload) => {
    calls.push({ action, payload });
    if (action === 'inspect') return { supportsUnified: unified.includes(payload.app) };
    if (action === 'detect') return store || {};
    return { ok: true };
  };
  return { platform, calls };
}

test('Windows uses a ChatGPT install for Codex only after matching protocol ownership', async () => {
  const executable = 'C:\\Users\\Tester\\AppData\\Local\\Programs\\ChatGPT\\ChatGPT.exe';
  const legacy = windowsPlatform({ files: [executable] });
  assert.equal((await legacy.platform.detect('codex')).installed, false);
  const unified = windowsPlatform({ files: [executable], unified: [executable] });
  const detected = await unified.platform.detect('codex');
  assert.equal(detected.detectedPath, executable);
  assert.equal(detected.supportsUnified, true);
  await unified.platform.launch('codex', { launchMode: 'auto', fullscreen: true }, detected);
  assert.equal(unified.calls.at(-1).payload.mode, 'unified');
  assert.equal(unified.calls.at(-1).payload.app, executable);
});
test('Windows preserves explicit application mode for a unified client', async () => {
  const executable = 'C:\\Apps\\My ChatGPT.exe';
  const f = windowsPlatform({ files: [executable], unified: [executable] });
  const detected = await f.platform.detect('chatgpt', executable);
  await f.platform.launch('chatgpt', { launchMode: 'application', fullscreen: false }, detected);
  assert.equal(f.calls.at(-1).payload.mode, 'application');
  assert.equal(f.calls.at(-1).payload.fullscreen, false);
});
test('Store metadata preserves exact activation identity and unified capability', async () => {
  const f = windowsPlatform({ store: { appUserModelId: 'OpenAI.ChatGPT_abc!App', supportsUnified: true } });
  const detected = await f.platform.detect('codex');
  await f.platform.launch('codex', { launchMode: 'auto', fullscreen: true }, detected);
  assert.equal(f.calls.at(-1).payload.app, 'store:OpenAI.ChatGPT_abc!App');
  assert.equal(f.calls.at(-1).payload.mode, 'unified');
});
test('QA Windows detection never executes registry or Store inspection helpers', async () => {
  const executable = 'C:\\Users\\Tester\\AppData\\Local\\Programs\\ChatGPT\\ChatGPT.exe';
  const f = windowsPlatform({ files: [executable], unified: [executable], qa: true });
  assert.equal((await f.platform.detect('chatgpt')).installed, true);
  assert.equal((await f.platform.detect('codex')).installed, false);
  assert.equal(f.calls.length, 0);
});
test('native response and execution errors produce actionable messages', () => {
  assert.equal(helperResult('diagnostic\r\n{"ok":true}').ok, true);
  assert.throws(() => helperResult('{bad'), /Reinstall LaunchFX/);
  assert.throws(() => helperResult('null'), /invalid response/);
  assert.throws(() => helperResult('{"error":"Choose a valid application."}'), /Choose a valid application/);
  assert.match(helperFailure({ killed: true }).message, /too long/);
  assert.match(helperFailure({ code: 'EACCES' }).message, /same privilege level/);
});
