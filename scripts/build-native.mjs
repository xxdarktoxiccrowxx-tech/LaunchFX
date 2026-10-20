import { mkdirSync, copyFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'native', 'bin');
mkdirSync(output, { recursive: true });
if (process.platform === 'darwin') {
  const universal = process.argv.includes('--universal');
  const source = path.join(root, 'native', 'macos', 'LaunchFXHelper.swift');
  const destination = path.join(output, 'launchfx-macos');
  const architectures = universal ? ['arm64', 'x86_64'] : [process.arch === 'x64' ? 'x86_64' : 'arm64'];
  for (const architecture of architectures) {
    execFileSync('xcrun', ['swiftc', '-O', '-parse-as-library', '-target', `${architecture}-apple-macosx13.0`, '-framework', 'Cocoa', '-framework', 'ApplicationServices', source, '-o', `${destination}-${architecture}`], { stdio: 'inherit' });
  }
  if (universal) execFileSync('xcrun', ['lipo', '-create', ...architectures.map(arch => `${destination}-${arch}`), '-output', destination], { stdio: 'inherit' });
  else copyFileSync(`${destination}-${architectures[0]}`, destination);
  for (const architecture of architectures) rmSync(`${destination}-${architecture}`, { force: true });
  chmodSync(destination, 0o755);
  execFileSync('codesign', ['--force', '--sign', '-', destination], { stdio: 'inherit' });
  console.log(`Native macOS helper built (${architectures.join(', ')}). No application was launched.`);
} else if (process.platform === 'win32') {
  if (!existsSync(path.join(root, 'native', 'windows', 'window.ps1'))) throw new Error('Windows helper is missing.');
  console.log('Windows helper ready. It uses built-in PowerShell/.NET, without changing execution policy.');
} else {
  console.log('Native helpers are built on macOS/Windows runners. Pure tests can run on this platform.');
}
