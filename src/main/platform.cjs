const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const { validateTarget } = require('./settings.cjs');
function helperResult(stdout) {
  let value;
  try { value = JSON.parse(String(stdout).trim().split(/\r?\n/).at(-1)); }
  catch { throw new Error('The native launcher returned an unreadable response. Reinstall LaunchFX, then try again.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The native launcher returned an invalid response. Reinstall LaunchFX, then try again.');
  if (value.error) throw new Error(String(value.error));
  return value;
}
function helperFailure(error) {
  if (error.killed || error.code === 'ETIMEDOUT') return new Error('The application took too long to respond. Open it directly once, check its path and permissions, then retry LaunchFX.');
  if (error.code === 'ENOENT') return new Error('The native launcher is unavailable. Reinstall LaunchFX and check that Windows PowerShell is installed.');
  if (error.code === 'EACCES' || error.code === 'EPERM') return new Error('The operating system blocked the launcher. Check application permissions and run LaunchFX and the target app at the same privilege level.');
  return new Error('The native launcher could not run. Open the target app directly once and check its installation and system permissions.');
}
function validateAppPath(candidate, platform = process.platform) {
  if (typeof candidate !== 'string' || /[\x00-\x1f]/.test(candidate) || candidate.length > 4096) throw new Error('Invalid application path.');
  if (platform === 'darwin' && (!path.isAbsolute(candidate) || !candidate.toLowerCase().endsWith('.app'))) throw new Error('Choose a macOS .app application.');
  if (platform === 'win32' && (!path.win32.isAbsolute(candidate) || !candidate.toLowerCase().endsWith('.exe'))) throw new Error('Choose a Windows .exe application.');
  if (!['darwin', 'win32'].includes(platform)) throw new Error('LaunchFX supports macOS and Windows.');
  return candidate;
}
function shellQuote(value) { return "'" + String(value).replace(/'/g, "'\\''") + "'"; }
function xmlEscape(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])); }
class Platform {
  constructor({ app, shell, qa, nativeDirectory, dataDirectory }) {
    Object.assign(this, { app, shell, qa, nativeDirectory, dataDirectory });
    this.macHelper = path.join(nativeDirectory, 'bin', 'launchfx-macos');
    this.windowsHelper = path.join(nativeDirectory, 'windows', 'window.ps1');
    this.powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  }
  nativeAvailable() { return process.platform === 'darwin' ? fs.existsSync(this.macHelper) : process.platform === 'win32' && fs.existsSync(this.windowsHelper); }
  assertReal() { if (this.qa) throw new Error('QA mode: launching apps and changing system settings are disabled.'); }
  async detect(id, override = '') {
    validateTarget(id);
    if (override) {
      try {
        validateAppPath(override);
        const installed = process.platform === 'darwin' ? fs.statSync(override).isDirectory() : fs.statSync(override).isFile();
        const metadata = installed && process.platform === 'win32' ? await this.inspectWindows(override) : {};
        return { id, detectedPath: override, installed, source: 'custom', ...metadata };
      } catch { return { id, detectedPath: override, installed: false, source: 'custom' }; }
    }
    if (process.platform === 'darwin') {
      const roots = ['/Applications', path.join(os.homedir(), 'Applications')];
      const names = id === 'codex' ? ['Codex.app', 'ChatGPT.app'] : ['ChatGPT.app'];
      for (const name of names) for (const root of roots) {
        const candidate = path.join(root, name);
        if (fs.existsSync(candidate)) {
          if (id === 'codex' && name === 'ChatGPT.app') {
            // Legacy ChatGPT does not contain Codex; only accept the verified unified bundle.
            try {
              const { stdout } = await execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(candidate, 'Contents', 'Info.plist')], { timeout: 2000 });
              if (stdout.trim() !== 'com.openai.codex') continue;
            } catch { continue; }
          }
          return { id, detectedPath: candidate, installed: true, source: 'detected' };
        }
      }
    }
    if (process.platform === 'win32') {
      const local = process.env.LOCALAPPDATA || '';
      const program = process.env.ProgramFiles || 'C:\\Program Files';
      const titles = id === 'codex' ? ['Codex', 'ChatGPT'] : ['ChatGPT', 'Codex'];
      for (const [index, title] of titles.entries()) {
        const candidates = [
          path.join(local, 'Programs', title, title + '.exe'),
          path.join(local, title, title + '.exe'),
          path.join(program, title, title + '.exe')
        ];
        for (const candidate of candidates) {
          let exists = false;
          try { exists = fs.statSync(candidate).isFile(); } catch { }
          if (!exists) continue;
          const metadata = await this.inspectWindows(candidate);
          // A fallback must prove it owns the Codex protocol; names alone cannot
          // distinguish a unified client from the older ChatGPT application.
          if (index > 0 && !metadata.supportsUnified) continue;
          return { id, detectedPath: candidate, installed: true, source: 'detected', ...metadata };
        }
      }
      // Discovery reads only matching installed app manifests. No app is started.
      if (!this.qa) {
        try {
          const data = await this.windows('detect', { target: id });
          if (data.appUserModelId) return { id, detectedPath: `store:${data.appUserModelId}`, installed: true, source: 'store', supportsUnified: data.supportsUnified === true };
        } catch { /* The manual file picker remains available. */ }
      }
    }
    return { id, detectedPath: '', installed: false, source: 'missing' };
  }
  async inspectWindows(candidate) {
    if (this.qa) return { supportsUnified: false };
    try {
      const result = await this.windows('inspect', { app: candidate }, 4000);
      return { supportsUnified: result.supportsUnified === true };
    } catch { return { supportsUnified: false }; }
  }
  async mac(args, timeout = 18000) {
    if (!fs.existsSync(this.macHelper)) throw new Error('Native helper is missing. Rebuild LaunchFX with npm run build:native.');
    let result;
    try { result = await execute(this.macHelper, args, { timeout, maxBuffer: 256 * 1024 }); }
    catch (error) { throw helperFailure(error); }
    return helperResult(result.stdout);
  }
  async windows(action, payload, timeout = 18000) {
    if (!['detect', 'inspect', 'status', 'launch'].includes(action)) throw new Error('Unsupported native helper action.');
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    // The only executable text is our bundled helper. Settings are base64 JSON data,
    // never PowerShell syntax; no execution-policy or persistent security setting is changed.
    const command = "$script = [ScriptBlock]::Create([IO.File]::ReadAllText($env:LAUNCHFX_NATIVE_SCRIPT)); & $script -Action $env:LAUNCHFX_NATIVE_ACTION -Payload $env:LAUNCHFX_NATIVE_PAYLOAD";
    let result;
    try {
      result = await execute(this.powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
        timeout, windowsHide: true, maxBuffer: 256 * 1024,
        env: { ...process.env, LAUNCHFX_NATIVE_SCRIPT: this.windowsHelper, LAUNCHFX_NATIVE_ACTION: action, LAUNCHFX_NATIVE_PAYLOAD: encoded }
      });
    } catch (error) { throw helperFailure(error); }
    return helperResult(result.stdout);
  }
  async isRunning(target) {
    if (this.qa || !target.installed) return false;
    try {
      if (process.platform === 'darwin') return (await this.mac(['status', '--app', target.detectedPath], 3000)).running;
      return (await this.windows('status', { app: target.detectedPath }, 4000)).running;
    } catch { return false; }
  }
  async launch(id, profile, detected) {
    this.assertReal();
    validateTarget(id);
    if (!detected.installed) throw new Error(`找不到 ${id === 'codex' ? 'Codex' : 'ChatGPT'}。请在设置中选择已安装的应用。 / Choose the installed app in Settings.`);
    if (!detected.detectedPath.startsWith('store:')) validateAppPath(detected.detectedPath);
    if (process.platform === 'darwin') {
      return this.mac(['launch', '--app', detected.detectedPath, '--target', id, '--mode', profile.launchMode, '--fullscreen', String(profile.fullscreen)], 24000);
    }
    const mode = profile.launchMode === 'auto' && detected.supportsUnified ? 'unified' : profile.launchMode;
    return this.windows('launch', { app: detected.detectedPath, target: id, mode, fullscreen: profile.fullscreen, stateDirectory: path.join(this.dataDirectory, 'window-state') }, 24000);
  }
  async createShortcut(id) {
    this.assertReal();
    validateTarget(id);
    if (!this.app.isPackaged) throw new Error('Install or package LaunchFX before creating desktop shortcuts.');
    const title = id === 'codex' ? 'Codex' : 'ChatGPT';
    const desktop = this.app.getPath('desktop');
    if (process.platform === 'win32') {
      const destination = path.join(desktop, `${title} — LaunchFX.lnk`);
      const iconFile = path.join(process.resourcesPath, 'icon.ico');
      const ok = this.shell.writeShortcutLink(destination, 'create', { target: process.execPath, args: `--launch=${id}`, description: `Open ${title} with LaunchFX`, icon: fs.existsSync(iconFile) ? iconFile : process.execPath, iconIndex: 0 });
      if (!ok) throw new Error('Could not create the Windows shortcut.');
      return { path: destination, manualPinNote: 'Right-click the shortcut to pin it to Start or the taskbar.' };
    }
    const destination = path.join(desktop, `${title} — LaunchFX.app`);
    const plist = path.join(destination, 'Contents', 'Info.plist');
    if (fs.existsSync(destination)) {
      const expected = `app.launchfx.shortcut.${id}`;
      if (!fs.existsSync(plist) || !fs.readFileSync(plist, 'utf8').includes(expected)) throw new Error('A different file already has this shortcut name.');
    }
    const executable = path.join(destination, 'Contents', 'MacOS', 'launch');
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    const actualApp = process.execPath.split('/Contents/MacOS/')[0];
    // -n creates a forwarding process, so Electron receives args even while LaunchFX is open.
    fs.writeFileSync(executable, `#!/bin/sh\nexec /usr/bin/open -n -a ${shellQuote(actualApp)} --args --launch=${id}\n`, { mode: 0o755 });
    fs.chmodSync(executable, 0o755);
    const iconSource = path.resolve(__dirname, '..', '..', 'assets', 'icon.icns');
    const resources = path.join(destination, 'Contents', 'Resources');
    if (fs.existsSync(iconSource)) {
      fs.mkdirSync(resources, { recursive: true });
      fs.copyFileSync(iconSource, path.join(resources, 'LaunchFX.icns'));
    }
    fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>app.launchfx.shortcut.${id}</string><key>CFBundleName</key><string>${xmlEscape(title)} — LaunchFX</string><key>CFBundleExecutable</key><string>launch</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleIconFile</key><string>LaunchFX.icns</string><key>LSUIElement</key><true/></dict></plist>`);
    return { path: destination, manualPinNote: 'Drag this shortcut into the Dock to use it as your everyday launcher.' };
  }
}
module.exports = { Platform, validateAppPath, shellQuote, xmlEscape, helperResult, helperFailure };
