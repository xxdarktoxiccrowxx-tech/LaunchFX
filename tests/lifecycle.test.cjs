const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const mainFile = path.resolve(__dirname, '../src/main/main.cjs');
const actualRequire = createRequire(mainFile);
async function fixture(t, qa = true, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launchfx-lifecycle-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const windows = [], launches = [], captures = [], osChanges = [], events = [], handlers = new Map();
  let launchError = null;
  let launchGate = null;
  let launchWarning = '';
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: '' };
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.isLoadingMainFrame = () => false;
      this.webContents.isDestroyed = () => this.destroyed;
      this.webContents.send = (name, data) => events.push({ name, data });
      windows.push(this);
    }
    async loadURL(url) { this.webContents.mainFrame.url = url; this.emit('ready-to-show'); }
    once(...args) { return super.once(...args); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
    show() {} focus() {} hide() {} setMenu() {} setVisibleOnAllWorkspaces() {}
  }
  class FakePlatform {
    nativeAvailable() { return true; }
    async detect(id) { return { id, detectedPath: `/Applications/${id}.app`, installed: true }; }
    async isRunning() { return false; }
    async launch(id, profile) { launches.push({ id, profile }); if (launchGate) await launchGate; if (launchError) throw launchError; return { ok: true, warning: launchWarning }; }
    async createShortcut() { osChanges.push('shortcut'); }
  }
  const app = new EventEmitter();
  Object.assign(app, {
    isPackaged: true, requestSingleInstanceLock: () => true, quit() {}, whenReady: async () => {},
    setPath() {}, getPath: () => directory, getVersion: () => '1.0.0',
    getLocale: () => options.locale || 'zh-CN',
    getLoginItemSettings: () => ({ wasOpenedAtLogin: !!options.openedAtLogin }),
    setLoginItemSettings: value => osChanges.push(value)
  });
  const image = { isEmpty: () => false, resize() { return this; }, setTemplateImage() {} };
  const electron = {
    app, BrowserWindow: Window, ipcMain: { handle: (key, handler) => handlers.set(key, handler) },
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    net: { fetch() {} },
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, webRequest: { onBeforeRequest() {} } } },
    screen: Object.assign(new EventEmitter(), { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, size: { width: 1440, height: 900 } }], getPrimaryDisplay() { return this.getAllDisplays()[0]; }, getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint() { return this.getPrimaryDisplay(); } }),
    systemPreferences: { getMediaAccessStatus: () => 'granted', isTrustedAccessibilityClient: prompt => { if (prompt) osChanges.push('permission'); return true; } },
    nativeTheme: { prefersReducedMotion: false },
    desktopCapturer: { getSources: async () => { captures.push(true); return []; } },
    dialog: { showErrorBox() {}, showOpenDialog: async () => ({ canceled: true }), showSaveDialog: async () => ({ canceled: true }), showMessageBox: async () => ({ response: 0 }) },
    shell: {}, Tray: class { setToolTip() {} setContextMenu() {} on() {} },
    Menu: { setApplicationMenu() {}, buildFromTemplate: value => value },
    nativeImage: { createFromPath: () => image, createFromDataURL: () => image },
    globalShortcut: { unregisterAll() {}, register: () => { osChanges.push('hotkey'); return true; } }
  };
  const sandbox = {
    require: name => name === 'electron' ? electron : name === './platform.cjs' ? { Platform: FakePlatform } : actualRequire(name),
    __dirname: path.dirname(mainFile), module: { exports: {} }, console, Buffer, URL, Response,
    process: { ...process, argv: ['node', 'main.cjs', ...(qa ? ['--qa'] : []), ...(options.visibleStartup ? [] : ['--hidden'])], platform: 'darwin', resourcesPath: directory },
    setTimeout, clearTimeout
  };
  vm.runInNewContext(fs.readFileSync(mainFile, 'utf8') + '\nmodule.exports = {beginLaunch,finishOperation,getState,showStudio,storeValue:()=>store,activeValue:()=>active};', sandbox, { filename: mainFile });
  await new Promise(resolve => setImmediate(resolve));
  const api = sandbox.module.exports;
  t.after(async () => { if (api.activeValue()) await api.finishOperation('cancel'); });
  return { api, launches, captures, osChanges, windows, events, handlers, setError: error => { launchError = error; }, setWarning: message => { launchWarning = message; }, setGate: gate => { launchGate = gate; } };
}
test('preview with desktop capture enabled never captures or launches the target', async t => {
  const f = await fixture(t, false);
  f.api.storeValue().patch({ desktopCapture: true });
  await f.api.beginLaunch('codex', true, 'singularity');
  await f.api.finishOperation('finish');
  assert.equal(f.launches.length, 0);
  assert.equal(f.captures.length, 0);
  assert.equal(f.api.activeValue(), null);
});
test('cancelling an animation prevents native application launch', async t => {
  const f = await fixture(t, false);
  await f.api.beginLaunch('codex');
  await f.api.finishOperation('cancel');
  assert.equal(f.launches.length, 0);
  assert.equal(f.api.activeValue(), null);
});
test('disabled animation still applies the selected windowed mode exactly once', async t => {
  const f = await fixture(t, false);
  f.api.storeValue().patch({ profiles: { codex: { enabled: false, fullscreen: false } } });
  await f.api.beginLaunch('codex');
  assert.equal(f.launches.length, 1);
  assert.equal(f.launches[0].profile.fullscreen, false);
  assert.equal(f.windows.length, 0);
  assert.equal(f.api.activeValue(), null);
});
test('only one launch can own the overlay and duplicate finishes do not relaunch', async t => {
  const f = await fixture(t, false);
  await f.api.beginLaunch('codex');
  await assert.rejects(f.api.beginLaunch('chatgpt'), /already in progress/);
  await Promise.all([f.api.finishOperation('finish'), f.api.finishOperation('skip')]);
  assert.equal(f.launches.length, 1);
  assert.equal(f.api.activeValue(), null);
});
test('native errors release the overlay and surface an actionable status', async t => {
  const f = await fixture(t, false);
  f.api.showStudio();
  f.setError(new Error('Selected application no longer exists.'));
  await f.api.beginLaunch('codex');
  await f.api.finishOperation('finish');
  assert.equal(f.api.activeValue(), null);
  assert.ok(f.windows.find(w => w.webContents.mainFrame.url.endsWith('/overlay.html')).destroyed);
  assert.ok(f.events.some(e => e.data.phase === 'error' && /no longer exists/.test(e.data.message)));
  const studio = f.windows.find(w => w.webContents.mainFrame.url.endsWith('/index.html'));
  const replay = await f.handlers.get('launchfx:status-current')({ sender: studio.webContents, senderFrame: studio.webContents.mainFrame });
  assert.equal(replay.phase, 'error');
  assert.match(replay.message, /no longer exists/);
});
test('cancel after native launch begins does not claim the launch was cancelled', async t => {
  const f = await fixture(t, false);
  f.api.showStudio();
  let release;
  f.setGate(new Promise(resolve => { release = resolve; }));
  await f.api.beginLaunch('codex');
  const finishing = f.api.finishOperation('finish');
  await f.api.finishOperation('cancel');
  assert.equal(f.launches.length, 1);
  assert.ok(f.api.activeValue());
  assert.equal(f.events.some(e => e.data.phase === 'cancelled'), false);
  release();
  await finishing;
  assert.equal(f.api.activeValue(), null);
});
test('QA mode rejects actual launches and system permission changes', async t => {
  const f = await fixture(t, true);
  await assert.rejects(f.api.beginLaunch('codex'), /QA preview/);
  f.api.showStudio();
  const studio = f.windows.at(-1);
  const event = { sender: studio.webContents, senderFrame: studio.webContents.mainFrame };
  await assert.rejects(f.handlers.get('launchfx:permission')(event, 'accessibility'), /QA mode/);
  await assert.rejects(f.handlers.get('launchfx:data-folder')(event), /QA mode/);
  await assert.rejects(f.handlers.get('launchfx:export')(event), /QA mode/);
  assert.equal(f.launches.length, 0);
  assert.equal(f.captures.length, 0);
  assert.equal(f.osChanges.length, 0);
});
test('IPC rejects a renderer outside the studio window', async t => {
  const f = await fixture(t, true);
  await assert.rejects(f.handlers.get('launchfx:save')({ sender: {}, senderFrame: { url: 'https://untrusted.example/' } }, { hotkeys: true }), /Untrusted/);
  assert.equal(f.osChanges.length, 0);
});
test('macOS login launches stay in the tray even when the OS does not forward arguments', async t => {
  const login = await fixture(t, false, { openedAtLogin: true, visibleStartup: true });
  assert.equal(login.windows.length, 0);
  const manual = await fixture(t, false, { openedAtLogin: false, visibleStartup: true });
  assert.equal(manual.windows.length, 1);
  assert.match(manual.windows[0].webContents.mainFrame.url, /index\.html$/);
});
test('shortcut launches surface native fullscreen warnings even without an open studio', async t => {
  const f = await fixture(t, false);
  f.setWarning('Allow Accessibility to control full screen.');
  await f.api.beginLaunch('codex');
  await f.api.finishOperation('finish');
  assert.equal(f.api.activeValue(), null);
  assert.ok(f.windows.some(w => w.webContents.mainFrame.url.endsWith('/index.html')));
  assert.ok(f.events.some(e => e.data.phase === 'done' && /Accessibility/.test(e.data.message)));
});
test('animation renderer failure closes the overlay without launching a target', async t => {
  const f = await fixture(t, false);
  await f.api.beginLaunch('codex');
  const overlay = f.windows.at(-1);
  overlay.webContents.emit('render-process-gone');
  assert.equal(overlay.destroyed, true);
  assert.equal(f.api.activeValue(), null);
  assert.equal(f.launches.length, 0);
  assert.ok(f.events.some(e => e.data.phase === 'error' && /renderer stopped/.test(e.data.message)));
});
test('first-run UI language follows the operating system', async t => {
  const english = await fixture(t, true, { locale: 'de-DE' });
  assert.equal(english.api.storeValue().get().language, 'en');
  const chinese = await fixture(t, true, { locale: 'zh-TW' });
  assert.equal(chinese.api.storeValue().get().language, 'zh');
});
