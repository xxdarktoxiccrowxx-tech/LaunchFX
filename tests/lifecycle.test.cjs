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
  let clock = 0, nextTimer = 0;
  const timers = new Map();
  const schedule = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: clock + delay }); return id; };
  async function advance(milliseconds) {
    const end = clock + milliseconds;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      clock = due[1].at;
      timers.delete(due[0]);
      await due[1].callback();
    }
    clock = end;
  }
  let launchError = null;
  let launchGate = null;
  let launchWarning = '';
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.destroyed = false; this.showCount = 0;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: '' };
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.isLoadingMainFrame = () => false;
      this.webContents.isDestroyed = () => this.destroyed;
      this.webContents.send = (name, data) => events.push({ name, data });
      windows.push(this);
    }
    async loadURL(url) {
      this.webContents.mainFrame.url = url;
      if (url.endsWith('/overlay.html')) {
        if (options.overlayLoadGate) await options.overlayLoadGate;
        if (options.overlayLoadError) throw new Error('Overlay could not be loaded.');
      }
      this.emit('ready-to-show');
    }
    once(...args) { return super.once(...args); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
    show() { this.showCount++; } focus() {} hide() {} setMenu() {} setVisibleOnAllWorkspaces() {}
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
    systemPreferences: {
      getMediaAccessStatus: () => 'granted',
      isTrustedAccessibilityClient: prompt => { if (prompt) osChanges.push('permission'); return true; },
      getAnimationSettings: options.animationSettingsUnavailable ? undefined : () => {
        if (options.animationSettingsError) throw new Error('Animation settings unavailable.');
        return { prefersReducedMotion: !!options.prefersReducedMotion };
      }
    },
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
    setTimeout: schedule, clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(fs.readFileSync(mainFile, 'utf8') + '\nmodule.exports = {beginLaunch,finishOperation,getState,showStudio,storeValue:()=>store,activeValue:()=>active};', sandbox, { filename: mainFile });
  await new Promise(resolve => setImmediate(resolve));
  const api = sandbox.module.exports;
  t.after(async () => { if (api.activeValue()) await api.finishOperation('cancel'); });
  return { api, launches, captures, osChanges, windows, events, handlers, advance, timers, setError: error => { launchError = error; }, setWarning: message => { launchWarning = message; }, setGate: gate => { launchGate = gate; } };
}
const overlayEvent = window => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
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
  const overlay = f.windows.find(w => w.webContents.mainFrame.url.endsWith('/overlay.html'));
  const finishing = f.api.finishOperation('finish');
  await f.api.finishOperation('cancel');
  assert.equal(f.launches.length, 1);
  assert.ok(f.api.activeValue());
  assert.equal(overlay.destroyed, true, 'A slow native window confirmation must not retain a frozen overlay.');
  await assert.rejects(f.api.beginLaunch('chatgpt'), /already in progress/);
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
test('motion snapshots use the system animation settings while honoring explicit choices', async t => {
  const cases = [
    { mode: 'system', prefersReducedMotion: true, expected: true },
    { mode: 'system', prefersReducedMotion: false, expected: false },
    { mode: 'always', prefersReducedMotion: false, expected: true },
    { mode: 'never', prefersReducedMotion: true, expected: false },
    { mode: 'system', animationSettingsUnavailable: true, expected: false },
    { mode: 'system', animationSettingsError: true, expected: false }
  ];
  for (const entry of cases) {
    const f = await fixture(t, true, entry);
    f.api.storeValue().patch({ reduceMotion: entry.mode, profiles: { codex: { duration: 10 } } });
    await f.api.beginLaunch('codex', true);
    assert.equal(f.api.activeValue().config.reducedMotion, entry.expected);
    assert.equal(f.api.activeValue().config.reduceMotion, entry.mode);
    assert.equal(f.api.activeValue().config.duration, 10, 'Motion preference must not rewrite duration.');
  }
});
test('overlay readiness starts playback timing once and preserves 4s and 10s snapshots', async t => {
  for (const duration of [4, 10]) {
    const f = await fixture(t, false);
    f.api.storeValue().patch({ profiles: { codex: { duration } } });
    await f.api.beginLaunch('codex');
    const overlay = f.windows.at(-1), event = overlayEvent(overlay);
    assert.equal(overlay.showCount, 0, 'Do not display an unpainted overlay.');
    await f.advance(1500);
    assert.equal(f.launches.length, 0);
    f.api.storeValue().patch({ profiles: { codex: { duration: 2 } } });
    assert.equal(f.api.activeValue().config.duration, duration);
    assert.equal(f.api.activeValue().profile.duration, duration);
    f.handlers.get('launchfx:overlay-ready')(event);
    assert.equal(overlay.showCount, 1);
    await f.advance(1000);
    const timer = f.api.activeValue().timer;
    f.handlers.get('launchfx:overlay-ready')(event);
    assert.equal(f.api.activeValue().timer, timer, 'Repeated ready messages must not extend the watchdog.');
    assert.equal(overlay.showCount, 1);
    await f.advance(duration * 1000 - 1000);
    assert.equal(f.launches.length, 0, 'Only the renderer completion may hand off after playback.');
    await f.api.finishOperation('finish');
    assert.equal(f.launches.length, 1);
    assert.equal(f.launches[0].profile.duration, duration);
    assert.equal(f.timers.size, 0);
  }
});
test('startup timeout aborts without opening a target', async t => {
  const f = await fixture(t, false);
  await f.api.beginLaunch('codex');
  const overlay = f.windows.at(-1);
  await f.advance(7999);
  assert.ok(f.api.activeValue());
  await f.advance(1);
  assert.equal(f.api.activeValue(), null);
  assert.equal(overlay.destroyed, true);
  assert.equal(f.launches.length, 0);
  assert.ok(f.events.some(e => e.data.phase === 'error' && /could not start/.test(e.data.message)));
  assert.equal(f.timers.size, 0);
});
test('a genuine overlay load failure survives cleanup instead of becoming a cancellation', async t => {
  const f = await fixture(t, false, { overlayLoadError: true });
  await assert.rejects(f.api.beginLaunch('codex'), /Overlay could not be loaded/);
  assert.equal(f.windows.at(-1).destroyed, true);
  assert.equal(f.api.activeValue(), null);
  assert.equal(f.launches.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.events.some(e => e.data.phase === 'cancelled'), false);
});
test('a late load rejection after startup timeout does not overwrite the timeout failure', async t => {
  let rejectLoad;
  const overlayLoadGate = new Promise((_resolve, reject) => { rejectLoad = reject; });
  const f = await fixture(t, false, { overlayLoadGate });
  const beginning = f.api.beginLaunch('codex');
  await new Promise(resolve => setImmediate(resolve));
  await f.advance(8000);
  rejectLoad(new Error('Loading aborted because the window was destroyed.'));
  assert.equal((await beginning).ok, false);
  assert.equal(f.api.activeValue(), null);
  assert.equal(f.launches.length, 0);
  assert.equal(f.timers.size, 0);
  const errors = f.events.filter(e => e.data.phase === 'error');
  assert.equal(errors.length, 1);
  assert.match(errors[0].data.message, /could not start/);
});
test('playback timeout reports failure rather than launching an unfinished animation', async t => {
  const f = await fixture(t, false);
  f.api.storeValue().patch({ profiles: { codex: { duration: 10 } } });
  await f.api.beginLaunch('codex');
  const overlay = f.windows.at(-1);
  await f.advance(1500);
  f.handlers.get('launchfx:overlay-ready')(overlayEvent(overlay));
  await f.advance(15999);
  assert.ok(f.api.activeValue());
  await f.advance(1);
  assert.equal(f.api.activeValue(), null);
  assert.equal(overlay.destroyed, true);
  assert.equal(f.launches.length, 0);
  assert.ok(f.events.some(e => e.data.phase === 'error' && /stopped responding/.test(e.data.message)));
});
test('overlay failure IPC validates its sender and message, then aborts without a launch', async t => {
  const f = await fixture(t, false);
  f.api.showStudio();
  const studio = f.windows.at(-1);
  await f.api.beginLaunch('codex');
  const overlay = f.windows.at(-1), event = overlayEvent(overlay);
  const failed = f.handlers.get('launchfx:overlay-failed');
  assert.throws(() => failed(overlayEvent(studio), 'Graphics context lost.'), /Untrusted overlay/);
  assert.throws(() => f.handlers.get('launchfx:overlay-ready')(overlayEvent(studio)), /Untrusted overlay/);
  for (const invalid of [null, {}, '', ' '.repeat(8), 'x'.repeat(513)]) assert.throws(() => failed(event, invalid), /Invalid animation error/);
  assert.ok(f.api.activeValue());
  failed(event, 'Graphics context lost. No application was opened.');
  assert.equal(overlay.destroyed, true);
  assert.equal(f.api.activeValue(), null);
  assert.equal(f.launches.length, 0);
  assert.equal(f.timers.size, 0);
  assert.ok(f.events.some(e => e.data.phase === 'error' && /Graphics context lost/.test(e.data.message)));
});
