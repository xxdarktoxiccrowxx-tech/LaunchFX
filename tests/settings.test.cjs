const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULTS, normalize, mergeSettings, selectEffect, parseLaunchArgs, defaultsForLocale, SettingsStore } = require('../src/main/settings.cjs');
const { Platform, validateAppPath, shellQuote } = require('../src/main/platform.cjs');

test('profiles keep animation and fullscreen choices independent', () => {
  const result = mergeSettings(normalize({}), { profiles: { codex: { enabled: false, fullscreen: false, duration: 3 } } });
  assert.equal(result.profiles.codex.enabled, false);
  assert.equal(result.profiles.codex.fullscreen, false);
  assert.equal(result.profiles.codex.duration, 3);
  assert.deepEqual(result.profiles.chatgpt, DEFAULTS.profiles.chatgpt);
});
test('untrusted imports clamp values, allowlist effects, and drop unknown code fields', () => {
  const input = JSON.parse('{"profiles":{"codex":{"duration":999,"effectId":"javascript:bad","appPath":"bad\\u0000.exe"}},"intensity":-5,"accent":"url(https://bad)","favorites":["warp","warp","unknown"],"command":"rm -rf","__proto__":{"polluted":true}}');
  const settings = normalize(input);
  assert.equal(settings.profiles.codex.duration, 15);
  assert.equal(settings.profiles.codex.effectId, 'singularity');
  assert.equal(settings.profiles.codex.appPath, '');
  assert.equal(settings.intensity, .1);
  assert.equal(settings.accent, DEFAULTS.accent);
  assert.deepEqual(settings.favorites, ['warp']);
  assert.equal(settings.command, undefined);
  assert.equal({}.polluted, undefined);
});
test('random selection uses favorites, with complete catalog fallback', () => {
  const settings = normalize({ profiles: { codex: { random: true } }, favorites: ['ink', 'warp'] });
  assert.equal(selectEffect(settings, 'codex', () => 0), 'ink');
  assert.equal(selectEffect(settings, 'codex', () => .999), 'warp');
  settings.favorites = [];
  assert.equal(selectEffect(settings, 'codex', () => 0), 'singularity');
});
test('settings save and reopen preserve user choices and create recoverable backups', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launchfx-settings-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new SettingsStore(directory);
  store.patch({ language: 'en', profiles: { codex: { fullscreen: false, enabled: false } } });
  const second = new SettingsStore(directory);
  assert.equal(second.get().language, 'en');
  assert.equal(second.get().profiles.codex.fullscreen, false);
  second.replace(DEFAULTS, true);
  const backups = fs.readdirSync(directory).filter(x => x.startsWith('settings-backup-'));
  assert.equal(backups.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, backups[0]))).language, 'en');
});
test('corrupt settings recover without erasing the original file', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launchfx-recovery-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'settings.json'), '{broken');
  const store = new SettingsStore(directory);
  assert.equal(store.get().schemaVersion, 1);
  assert.ok(store.recoveryMessage);
  const recovery = fs.readdirSync(directory).find(x => x.startsWith('settings-recovery-'));
  assert.equal(fs.readFileSync(path.join(directory, recovery), 'utf8'), '{broken');
});
test('startup arguments reject arbitrary targets and commands', () => {
  assert.equal(parseLaunchArgs(['--launch=codex']).targetId, 'codex');
  assert.equal(parseLaunchArgs(['--launch=terminal;rm']).targetId, null);
  assert.equal(parseLaunchArgs(['--preview=matrix']).previewEffect, 'matrix');
  assert.equal(parseLaunchArgs(['--preview=unknown']).previewEffect, null);
});
test('platform paths require absolute application bundles or executables', () => {
  assert.equal(validateAppPath('/Applications/Codex.app', 'darwin'), '/Applications/Codex.app');
  assert.equal(validateAppPath('C:\\Program Files\\Codex\\Codex.exe', 'win32'), 'C:\\Program Files\\Codex\\Codex.exe');
  assert.throws(() => validateAppPath('Codex.app', 'darwin'));
  assert.throws(() => validateAppPath('/bin/sh', 'darwin'));
  assert.throws(() => validateAppPath('C:\\evil.exe\0--run', 'win32'));
  assert.throws(() => validateAppPath('C:\\test.cmd', 'win32'));
});
test('generated macOS shortcut shell quoting preserves literal punctuation', () => {
  assert.equal(shellQuote("/Applications/Jack's $(echo bad).app"), "'/Applications/Jack'\\''s $(echo bad).app'");
});
test('macOS shortcuts forward launch arguments when LaunchFX is already running', { skip: process.platform !== 'darwin' }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launchfx-shortcut-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const platform = new Platform({ app: { isPackaged: true, getPath: () => directory }, shell: {}, qa: false, nativeDirectory: directory, dataDirectory: directory });
  const created = await platform.createShortcut('codex');
  const script = fs.readFileSync(path.join(created.path, 'Contents', 'MacOS', 'launch'), 'utf8');
  assert.match(script, /\/usr\/bin\/open -n -a /);
  assert.match(script, /--args --launch=codex\n$/);
  assert.equal(fs.statSync(path.join(created.path, 'Contents', 'MacOS', 'launch')).mode & 0o111, 0o111);
});
test('system locale sets first-run and reset language without replacing saved preferences', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launchfx-locale-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  assert.equal(defaultsForLocale('zh_Hant_TW').language, 'zh');
  assert.equal(defaultsForLocale('fr-FR').language, 'en');
  const first = new SettingsStore(directory, 'en-US');
  assert.equal(first.get().language, 'en');
  first.patch({ language: 'zh' });
  const reopened = new SettingsStore(directory, 'en-US');
  assert.equal(reopened.get().language, 'zh');
  reopened.reset();
  assert.equal(reopened.get().language, 'en');
});
