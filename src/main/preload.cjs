const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, ...args) => ipcRenderer.invoke(`launchfx:${channel}`, ...args);
const subscribe = (channel, handler) => {
  if (typeof handler !== 'function') throw new TypeError('Expected an event handler');
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(`launchfx:${channel}`, listener);
  return () => ipcRenderer.removeListener(`launchfx:${channel}`, listener);
};
const subscribeStatus = handler => {
  if (typeof handler !== 'function') throw new TypeError('Expected an event handler');
  let active = true, sequence = -1;
  const accept = payload => {
    if (active && payload && payload.sequence > sequence) {
      sequence = payload.sequence;
      handler(payload);
    }
  };
  const unsubscribe = subscribe('launch-status', accept);
  // Startup detection can outlive page load. Replay only after the UI subscribes.
  invoke('status-current').then(accept).catch(() => {});
  return () => { active = false; unsubscribe(); };
};
contextBridge.exposeInMainWorld('launchfx', Object.freeze({
  getState: () => invoke('state'),
  saveSettings: patch => invoke('save', patch),
  launch: targetId => invoke('launch', targetId),
  preview: options => invoke('preview', options),
  chooseApp: targetId => invoke('choose-app', targetId),
  createShortcut: targetId => invoke('shortcut', targetId),
  exportSettings: () => invoke('export'),
  importSettings: () => invoke('import'),
  resetSettings: () => invoke('reset'),
  openDataFolder: () => invoke('data-folder'),
  requestPermission: kind => invoke('permission', kind),
  onStateChanged: handler => subscribe('state-changed', handler),
  onLaunchStatus: subscribeStatus,
  overlayConfig: () => invoke('overlay-config'),
  finishOverlay: action => invoke('overlay-finish', action)
}));
