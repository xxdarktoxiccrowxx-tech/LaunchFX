const { app, BrowserWindow, ipcMain, protocol, net, session, screen, systemPreferences, desktopCapturer, dialog, shell, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { SettingsStore, DEFAULTS, CATALOG, EFFECT_IDS, normalize, selectEffect, validateTarget, parseLaunchArgs } = require('./settings.cjs');
const { Platform } = require('./platform.cjs');

const qa = process.argv.includes('--qa') || fs.existsSync(path.join(process.resourcesPath, 'launchfx-qa.json'));
const sourceRoot = path.resolve(__dirname, '..', '..');
const rendererDirectory = path.join(sourceRoot, 'src', 'renderer');
const assetsDirectory = path.join(sourceRoot, 'assets');
const origin = 'launchfx://app';
const nativeDirectory = app.isPackaged ? path.join(process.resourcesPath, 'native') : path.join(sourceRoot, 'native');
if (qa) app.setPath('userData', path.join(os.tmpdir(), 'launchfx-qa'));
protocol.registerSchemesAsPrivileged([{ scheme: 'launchfx', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
let store, platform, studio, tray, overlay = null, active = null, quitting = false;
let hotkeyError = null;
let lastLaunchStatus = null, statusSequence = 0;
let detectCache = null, detectCacheTime = 0;
const pendingArgs = [];
const titleFor = id => id === 'codex' ? 'Codex' : 'ChatGPT';

function safeLog(event, detail = '') {
  // Never log screen images, prompts, app contents, or account identifiers.
  const file = path.join(app.getPath('userData'), 'launchfx.log');
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 256 * 1024) fs.renameSync(file, file + '.previous');
    fs.appendFileSync(file, `${new Date().toISOString()} ${event} ${String(detail).slice(0, 200)}\n`, { mode: 0o600 });
  } catch { /* Diagnostics must never interrupt a launch. */ }
}
function assertStudio(event) {
  if (!studio || event.sender !== studio.webContents || event.senderFrame !== studio.webContents.mainFrame || !event.senderFrame.url.startsWith(origin + '/index.html')) throw new Error('Untrusted settings request.');
}
function assertOverlay(event) {
  if (!overlay || event.sender !== overlay.webContents || event.senderFrame !== overlay.webContents.mainFrame || !event.senderFrame.url.startsWith(origin + '/overlay.html')) throw new Error('Untrusted overlay request.');
}
function hardenWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(origin + '/')) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
}
function windowOptions(extra = {}) {
  return {
    icon: path.join(assetsDirectory, 'icon.png'), backgroundColor: '#090b12', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false },
    ...extra
  };
}
function showStudio() {
  if (!studio || studio.isDestroyed()) {
    studio = new BrowserWindow(windowOptions({ width: 1440, height: 960, minWidth: 1050, minHeight: 760, title: qa ? 'LaunchFX · QA Preview' : 'LaunchFX', autoHideMenuBar: true, titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', trafficLightPosition: { x: 22, y: 19 } }));
    hardenWindow(studio);
    studio.loadURL(origin + '/index.html');
    studio.once('ready-to-show', () => studio?.show());
    studio.on('close', event => {
      if (!quitting && !qa && store.get().minimizeToTray && tray) { event.preventDefault(); studio.hide(); }
    });
    studio.on('closed', () => { studio = null; });
  } else { studio.show(); studio.focus(); }
}
function status(phase, message = '', targetId = null) {
  const payload = { phase, message, targetId, sequence: ++statusSequence };
  lastLaunchStatus = payload;
  if (!studio || studio.isDestroyed()) return;
  const recipient = studio.webContents;
  const send = () => { if (!recipient.isDestroyed()) recipient.send('launchfx:launch-status', payload); };
  if (recipient.isLoadingMainFrame()) recipient.once('did-finish-load', send);
  else send();
}
async function detectedApps(force = false) {
  const settings = store.get();
  const key = JSON.stringify([settings.profiles.chatgpt.appPath, settings.profiles.codex.appPath]);
  if (!force && detectCache?.key === key && Date.now() - detectCacheTime < 5000) return detectCache.apps;
  const apps = await Promise.all(['chatgpt', 'codex'].map(id => platform.detect(id, settings.profiles[id].appPath)));
  detectCache = { key, apps }; detectCacheTime = Date.now();
  return apps;
}
async function getState() {
  const settings = store.get();
  return {
    settings, catalog: CATALOG, platform: process.platform, version: app.getVersion(), qa,
    capabilities: {
      screenCaptureStatus: qa ? 'qa-disabled' : process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'available',
      accessibilityTrusted: qa ? false : process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : true,
      nativeHelperAvailable: platform.nativeAvailable()
    },
    apps: await detectedApps(),
    displays: screen.getAllDisplays().map(d => ({ id: String(d.id), label: d.label || `${d.size.width} × ${d.size.height}`, primary: d.id === screen.getPrimaryDisplay().id })),
    diagnostics: { recoveryMessage: store.recoveryMessage, hotkeyError, launcherOnly: true }
  };
}
async function broadcast() {
  if (studio && !studio.isDestroyed()) studio.webContents.send('launchfx:state-changed', await getState());
  updateTray();
}
function updateTray() {
  if (!tray) return;
  const settings = store.get(), zh = settings.language === 'zh';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: zh ? '打开特效工坊' : 'Open LaunchFX Studio', click: showStudio },
    { type: 'separator' },
    { label: zh ? '启动 ChatGPT' : 'Launch ChatGPT', click: () => beginLaunch('chatgpt').catch(reportError) },
    { label: zh ? '启动 Codex' : 'Launch Codex', click: () => beginLaunch('codex').catch(reportError) },
    { type: 'separator' },
    { label: zh ? '退出 LaunchFX' : 'Quit LaunchFX', click: () => { quitting = true; app.quit(); } }
  ]));
}
function createTray() {
  if (qa) return;
  const iconPath = path.join(assetsDirectory, 'tray.png');
  let image = nativeImage.createFromPath(fs.existsSync(iconPath) ? iconPath : path.join(assetsDirectory, 'icon.png'));
  if (image.isEmpty()) image = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');
  image = image.resize({ width: process.platform === 'darwin' ? 18 : 24, height: process.platform === 'darwin' ? 18 : 24 });
  if (process.platform === 'darwin') image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('LaunchFX');
  tray.on('click', showStudio);
  updateTray();
}
function applyHotkeys() {
  if (qa) return;
  globalShortcut.unregisterAll(); hotkeyError = null;
  if (!store.get().hotkeys) return;
  const registrations = [
    ['CommandOrControl+Alt+1', 'chatgpt'],
    ['CommandOrControl+Alt+2', 'codex']
  ];
  for (const [key, id] of registrations) {
    if (!globalShortcut.register(key, () => beginLaunch(id).catch(reportError))) hotkeyError = 'A launch shortcut is already used by another app. Choose another app’s shortcut settings or disable LaunchFX hotkeys.';
  }
}
function applyLogin(enabled) {
  if (qa) return;
  if (!app.isPackaged && enabled) throw new Error('Install the packaged application before enabling launch at login.');
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
}
function displayFor(settings) {
  if (settings.display === 'cursor') return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return screen.getAllDisplays().find(d => String(d.id) === settings.display) || screen.getPrimaryDisplay();
}
function reducedMotion(settings) {
  if (settings.reduceMotion === 'always') return true;
  if (settings.reduceMotion !== 'system') return false;
  try { return systemPreferences.getAnimationSettings?.()?.prefersReducedMotion === true; }
  catch { return false; }
}
async function captureDesktop(display, settings, preview) {
  if (qa || preview || !settings.desktopCapture) return null;
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') return null;
  try {
    let timeout;
    const sources = await Promise.race([
      desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1800, height: 1200 }, fetchWindowIcons: false }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('capture-timeout')), 1800); })
    ]).finally(() => clearTimeout(timeout));
    const source = sources.find(x => x.display_id === String(display.id));
    return source && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : null;
  } catch { return null; }
}
function reportError(error) {
  safeLog('error', error.message);
  showStudio();
  status('error', error.message);
}
function closeOverlay() {
  const current = overlay; overlay = null;
  if (current && !current.isDestroyed()) current.destroy();
}
function abortAnimation(operation, message) {
  if (!operation || active !== operation || operation.finishing) return;
  operation.finishing = true;
  operation.cancelled = true;
  clearTimeout(operation.timer);
  operation.config.desktopImage = null;
  active = null;
  closeOverlay();
  reportError(new Error(message));
}
function overlayReady() {
  const operation = active;
  if (!operation || operation.finishing) throw new Error('The animation is no longer active.');
  if (operation.ready) return { ok: true };
  operation.ready = true;
  operation.startedAt = Date.now();
  clearTimeout(operation.timer);
  overlay.show();
  overlay.focus();
  status('playing', '', operation.targetId);
  safeLog('animation-start', `target=${operation.targetId} duration=${operation.config.duration}s motion=${operation.config.reduceMotion} reduced=${operation.config.reducedMotion} preview=${operation.preview}`);
  operation.timer = setTimeout(() => abortAnimation(operation, 'The animation stopped responding. No application was opened. Try Eco quality or another effect.'), Math.max(8000, operation.config.duration * 1000 + 6000));
  return { ok: true };
}
async function nativeLaunch(operation) {
  if (active !== operation || operation.cancelled) return;
  status('opening', '', operation.targetId);
  try {
    const result = await platform.launch(operation.targetId, operation.profile, operation.detected);
    if (active !== operation) return;
    if (result.warning) showStudio();
    status('done', result.warning || '', operation.targetId);
    safeLog('launch-complete', operation.targetId);
  } catch (error) {
    if (active === operation) reportError(error);
  } finally {
    if (active === operation) {
      clearTimeout(operation.timer); operation.config.desktopImage = null;
      closeOverlay(); active = null;
    }
  }
}
async function finishOperation(action) {
  const operation = active;
  if (!operation || operation.finishing) return;
  if (!['finish', 'skip', 'cancel'].includes(action)) throw new Error('Invalid transition action.');
  operation.finishing = true;
  clearTimeout(operation.timer);
  safeLog('animation-complete', `target=${operation.targetId} duration=${operation.config.duration}s elapsed=${operation.startedAt === null ? 0 : Math.max(0, Date.now() - operation.startedAt)}ms action=${action} preview=${operation.preview}`);
  if (action === 'cancel' || operation.preview) {
    operation.cancelled = true;
    operation.config.desktopImage = null;
    closeOverlay(); active = null;
    status(action === 'cancel' ? 'cancelled' : 'done', operation.preview ? 'Preview complete — no application was opened.' : '', operation.targetId);
    if (operation.preview) showStudio();
    return;
  }
  // Window-mode confirmation can take several seconds. Never cover the target
  // with a stopped animation while waiting for the native helper to finish.
  operation.config.desktopImage = null;
  closeOverlay();
  operation.timer = setTimeout(() => {
    if (active !== operation) return;
    operation.cancelled = true;
    operation.config.desktopImage = null;
    closeOverlay(); active = null;
    reportError(new Error('The application took too long to open. Check its path and permissions, then try again.'));
  }, 28000);
  await nativeLaunch(operation);
}
async function beginLaunch(targetId, preview = false, effectId = null) {
  validateTarget(targetId);
  if (active) throw new Error('An animation or app launch is already in progress.');
  if (qa && !preview) throw new Error('QA preview cannot open ChatGPT or Codex. Use Preview to inspect animations.');
  if (effectId !== null && !EFFECT_IDS.has(effectId)) throw new Error('Unknown animation.');
  const settings = store.get(), profile = settings.profiles[targetId], display = displayFor(settings);
  const operation = {
    targetId, profile, preview, cancelled: false, finishing: false, ready: false, startedAt: null, timer: null, detected: null,
    config: {
      effectId: effectId || selectEffect(settings, targetId), targetName: titleFor(targetId), targetId,
      duration: profile.duration, intensity: settings.intensity, quality: settings.quality,
      accent: settings.accent, seed: Math.floor(Math.random() * 100000), desktopImage: null,
      preview, reducedMotion: reducedMotion(settings), reduceMotion: settings.reduceMotion, sound: settings.sound, volume: settings.volume,
      fpsLimit: settings.fpsLimit, language: settings.language
    }
  };
  active = operation;
  try {
    operation.detected = preview ? null : (await detectedApps(true)).find(x => x.id === targetId);
    if (active !== operation) return { ok: false };
    if (!preview && !operation.detected.installed) throw new Error(`找不到 ${titleFor(targetId)}。请在设置中选择应用。 / Choose the installed application in Settings.`);
    const skip = !preview && (!profile.enabled || (settings.skipIfRunning && await platform.isRunning(operation.detected)));
    if (skip) { await finishOperation('finish'); return { ok: true }; }
    operation.config.desktopImage = await captureDesktop(display, settings, preview);
    if (active !== operation) return { ok: false };
    overlay = new BrowserWindow(windowOptions({
      ...display.bounds, frame: false, resizable: false, movable: false, skipTaskbar: true,
      alwaysOnTop: true, fullscreenable: true, title: `LaunchFX — ${preview ? 'Preview' : titleFor(targetId)}`,
      webPreferences: { ...windowOptions().webPreferences, backgroundThrottling: false }
    }));
    hardenWindow(overlay);
    overlay.setMenu(null);
    if (process.platform === 'darwin') overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlay.webContents.on('render-process-gone', () => {
      abortAnimation(operation, 'The animation renderer stopped. No application was opened. Try Eco quality or another effect.');
    });
    overlay.on('closed', () => {
      if (active === operation && !operation.finishing) finishOperation('cancel');
    });
    // Loading/compilation has its own deadline. Playback timing starts only
    // after the renderer has painted its first frame and acknowledges readiness.
    operation.timer = setTimeout(() => abortAnimation(operation, 'The animation could not start. No application was opened. Try Eco quality or another effect.'), 8000);
    await overlay.loadURL(origin + '/overlay.html');
    return { ok: active === operation };
  } catch (error) {
    const wasCancelled = operation.cancelled;
    if (active === operation) { clearTimeout(operation.timer); operation.config.desktopImage = null; active = null; closeOverlay(); }
    if (wasCancelled) return { ok: false };
    throw error;
  }
}
function registerIPC() {
  const studioHandler = (name, fn) => ipcMain.handle('launchfx:' + name, async (event, ...args) => { assertStudio(event); return fn(...args); });
  studioHandler('state', getState);
  studioHandler('status-current', () => lastLaunchStatus);
  studioHandler('save', async patch => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Buffer.byteLength(JSON.stringify(patch)) > 128 * 1024) throw new Error('Invalid settings.');
    const before = store.get(), merged = require('./settings.cjs').mergeSettings(before, patch);
    if (Object.hasOwn(patch, 'runAtLogin') && merged.runAtLogin !== before.runAtLogin) applyLogin(merged.runAtLogin);
    store.replace(merged);
    if (Object.hasOwn(patch, 'hotkeys')) applyHotkeys();
    await broadcast();
    return store.get();
  });
  studioHandler('launch', id => beginLaunch(id));
  studioHandler('preview', options => beginLaunch(validateTarget(options?.targetId || store.get().defaultTarget), true, options?.effectId ?? null));
  studioHandler('choose-app', async id => {
    validateTarget(id);
    const result = await dialog.showOpenDialog(studio, { title: `Choose ${titleFor(id)}`, properties: ['openFile'], filters: [{ name: 'Applications', extensions: process.platform === 'darwin' ? ['app'] : ['exe'] }] });
    if (result.canceled) return { cancelled: true };
    const chosen = require('./platform.cjs').validateAppPath(result.filePaths[0]);
    store.patch({ profiles: { [id]: { appPath: chosen } } }); detectCache = null;
    await broadcast(); return { cancelled: false, path: chosen };
  });
  studioHandler('shortcut', id => platform.createShortcut(id));
  studioHandler('export', async () => {
    if (qa) throw new Error('QA mode keeps settings in its temporary folder and cannot export files.');
    const result = await dialog.showSaveDialog(studio, { title: 'Export LaunchFX settings', defaultPath: 'LaunchFX-settings.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled) return { cancelled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(store.get(), null, 2) + '\n', { mode: 0o600 });
    return { ok: true };
  });
  studioHandler('import', async () => {
    const result = await dialog.showOpenDialog(studio, { title: 'Import LaunchFX settings', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled) return { cancelled: true };
    const file = result.filePaths[0];
    if (fs.statSync(file).size > 128 * 1024) throw new Error('Settings file is too large.');
    let incoming;
    try { incoming = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('This is not a valid JSON settings file.'); }
    if (!incoming || incoming.schemaVersion !== 1 || !incoming.profiles) throw new Error('This file is not a supported LaunchFX settings export.');
    const current = store.get(), normalized = normalize(incoming);
    // Imports never enable OS integrations or new desktop access.
    for (const key of ['runAtLogin', 'hotkeys', 'desktopCapture']) normalized[key] = current[key];
    store.replace(normalized, true); detectCache = null;
    await broadcast(); return { ok: true, settings: store.get() };
  });
  studioHandler('reset', async () => {
    const result = await dialog.showMessageBox(studio, { type: 'question', title: 'Reset LaunchFX', message: 'Restore default settings?', detail: 'Your existing settings will be backed up. Login startup and global hotkeys will be disabled.', buttons: ['Cancel', 'Reset'], defaultId: 0, cancelId: 0 });
    if (result.response !== 1) return { cancelled: true };
    if (store.get().runAtLogin) applyLogin(false);
    store.reset(); applyHotkeys(); detectCache = null;
    await broadcast(); return { settings: store.get() };
  });
  studioHandler('data-folder', async () => {
    if (qa) throw new Error('QA mode does not open external applications or folders.');
    const error = await shell.openPath(app.getPath('userData'));
    if (error) throw new Error(error);
    return { ok: true };
  });
  studioHandler('permission', async kind => {
    if (qa) throw new Error('QA mode does not request system permissions.');
    if (!['accessibility', 'screen'].includes(kind)) throw new Error('Unknown permission.');
    if (process.platform !== 'darwin') return { ok: true };
    if (kind === 'accessibility') systemPreferences.isTrustedAccessibilityClient(true);
    else {
      const status = systemPreferences.getMediaAccessStatus('screen');
      if (status === 'not-determined') {
        // This is the user's explicit permission action; pixels are discarded immediately.
        await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
      }
      if (systemPreferences.getMediaAccessStatus('screen') !== 'granted') await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    }
    await broadcast(); return { ok: true };
  });
  ipcMain.handle('launchfx:overlay-config', event => { assertOverlay(event); return active?.config || null; });
  ipcMain.handle('launchfx:overlay-ready', event => { assertOverlay(event); return overlayReady(); });
  ipcMain.handle('launchfx:overlay-failed', (event, message) => {
    assertOverlay(event);
    if (typeof message !== 'string' || !message.trim() || message.length > 512) throw new Error('Invalid animation error.');
    abortAnimation(active, message.trim());
    return { ok: true };
  });
  ipcMain.handle('launchfx:overlay-finish', async (event, action) => { assertOverlay(event); await finishOperation(action); return { ok: true }; });
}
async function dispatchArgs(args) {
  const request = parseLaunchArgs(args);
  if (request.previewEffect) return beginLaunch(store.get().defaultTarget, true, request.previewEffect);
  if (request.targetId) return beginLaunch(request.targetId);
  if (!request.hidden) showStudio();
}
app.on('second-instance', (_event, argv) => { if (!store) pendingArgs.push(argv); else dispatchArgs(argv).catch(reportError); });
app.on('activate', () => { if (store && !active) showStudio(); });
app.on('before-quit', () => { quitting = true; if (active) { active.cancelled = true; clearTimeout(active.timer); active.config.desktopImage = null; } });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (qa || (!tray && process.platform !== 'darwin')) app.quit(); });
if (single) app.whenReady().then(async () => {
  store = new SettingsStore(app.getPath('userData'), app.getLocale());
  platform = new Platform({ app, shell, qa, nativeDirectory, dataDirectory: app.getPath('userData') });
  protocol.handle('launchfx', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Forbidden', { status: 403 });
    const requested = path.resolve(rendererDirectory, '.' + decodeURIComponent(url.pathname));
    if (!requested.startsWith(rendererDirectory + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(requested).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  // The app is offline by design, including its overlays. Deny renderer network requests.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'LaunchFX', submenu: [{ role: 'about' }, { type: 'separator' }, { label: 'Open Studio', click: showStudio }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
  ]));
  registerIPC(); createTray(); applyHotkeys();
  screen.on('display-added', () => broadcast());
  screen.on('display-removed', () => broadcast());
  const openedAtLogin = !qa && process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin;
  await dispatchArgs(openedAtLogin ? [...process.argv, '--hidden'] : process.argv).catch(reportError);
  for (const args of pendingArgs) await dispatchArgs(args).catch(reportError);
}).catch(error => { safeLog('startup-error', error.message); dialog.showErrorBox('LaunchFX', error.message); app.quit(); });
