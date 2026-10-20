import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const builder = createRequire(require.resolve('electron-builder'));
const packager = createRequire(builder.resolve('app-builder-lib'));
const asar = packager('@electron/asar');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

function architectures(file) {
  const data = fs.readFileSync(file);
  if (data.readUInt32BE(0) === 0xcafebabe) {
    return Array.from({ length: data.readUInt32BE(4) }, (_, i) => data.readUInt32BE(8 + i * 20));
  }
  return [data.readUInt32LE(4)];
}

const candidates = [
  ['mac-arm64', 'release/mac-arm64/LaunchFX.app/Contents/Resources', 0x0100000c],
  ['mac-x64', 'release/mac/LaunchFX.app/Contents/Resources', 0x01000007],
  ['win-x64', 'release/win-unpacked/resources', null],
  ['win-x64-cross', 'release/windows/win-unpacked/resources', null]
];
let verified = 0;
for (const [label, relative, cpu] of candidates) {
  const resources = path.join(root, relative);
  if (!fs.existsSync(resources)) continue;
  const archive = path.join(resources, 'app.asar');
  assert.ok(fs.existsSync(archive), `${label}: app.asar missing`);
  assert.ok(!fs.existsSync(path.join(resources, 'launchfx-qa.json')), `${label}: QA marker must never ship`);
  for (const source of sourceFiles(path.join(root, 'src'))) {
    // @electron/asar traverses entries with the host's path.sep, including on Windows.
    const name = path.relative(root, source);
    assert.deepEqual(asar.extractFile(archive, name), fs.readFileSync(source), `${label}: stale ${name}`);
  }
  for (const asset of ['icon.png', 'icon.icns', 'tray.png']) {
    assert.deepEqual(asar.extractFile(archive, path.join('assets', asset)), fs.readFileSync(path.join(root, 'assets', asset)));
  }
  assert.deepEqual(fs.readFileSync(path.join(resources, 'icon.ico')), fs.readFileSync(path.join(root, 'assets/icon.ico')));
  assert.deepEqual(
    fs.readFileSync(path.join(resources, 'native/windows/window.ps1')),
    fs.readFileSync(path.join(root, 'native/windows/window.ps1')),
    `${label}: stale Windows helper`
  );
  if (cpu) {
    assert.ok(architectures(path.join(resources, 'native/bin/launchfx-macos')).includes(cpu), `${label}: helper architecture mismatch`);
  }
  console.log(`Verified ${label}: current source, icons, native helper and production mode.`);
  verified++;
}
assert.ok(verified > 0, 'Build a package before running package verification.');
