const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CATALOG = require('../shared/catalog.json');
const EFFECT_IDS = new Set(CATALOG.map(x => x.id));
const TARGETS = ['chatgpt', 'codex'];
const clone = value => JSON.parse(JSON.stringify(value));
const DEFAULTS = {
  schemaVersion: 1, language: 'zh',
  profiles: {
    chatgpt: { enabled: true, fullscreen: false, effectId: 'aurora', duration: 4.5, random: false, appPath: '', launchMode: 'auto' },
    codex: { enabled: true, fullscreen: true, effectId: 'singularity', duration: 6, random: false, appPath: '', launchMode: 'auto' }
  },
  favorites: ['singularity', 'aurora', 'warp'], quality: 'auto', fpsLimit: 60,
  intensity: .75, accent: '#86a8ff', sound: false, volume: .2,
  desktopCapture: false, reduceMotion: 'system', display: 'cursor', runAtLogin: false,
  minimizeToTray: true, skipIfRunning: false, hotkeys: false, defaultTarget: 'codex'
};
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function bool(value, fallback) { return typeof value === 'boolean' ? value : fallback; }
function number(value, min, max, fallback) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback; }
function choice(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
function appPath(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f]/.test(value)) return '';
  return value.trim();
}
function normalize(input) {
  input = object(input);
  const result = clone(DEFAULTS);
  result.language = choice(input.language, ['zh', 'en'], result.language);
  for (const id of TARGETS) {
    const source = object(object(input.profiles)[id]), target = result.profiles[id];
    for (const key of ['enabled', 'fullscreen', 'random']) target[key] = bool(source[key], target[key]);
    target.effectId = EFFECT_IDS.has(source.effectId) ? source.effectId : target.effectId;
    target.duration = number(source.duration, 1.5, 15, target.duration);
    target.appPath = appPath(source.appPath);
    target.launchMode = choice(source.launchMode, ['auto', 'application', 'unified'], 'auto');
  }
  if (Array.isArray(input.favorites)) result.favorites = [...new Set(input.favorites.filter(x => EFFECT_IDS.has(x)))];
  result.quality = choice(input.quality, ['auto', 'high', 'eco'], 'auto');
  result.fpsLimit = choice(input.fpsLimit, [30, 60, 120], 60);
  result.intensity = number(input.intensity, .1, 1, .75);
  result.volume = number(input.volume, 0, 1, .2);
  result.accent = typeof input.accent === 'string' && /^#[0-9a-f]{6}$/i.test(input.accent) ? input.accent.toLowerCase() : result.accent;
  for (const key of ['sound', 'desktopCapture', 'runAtLogin', 'minimizeToTray', 'skipIfRunning', 'hotkeys']) result[key] = bool(input[key], result[key]);
  result.reduceMotion = choice(input.reduceMotion, ['system', 'always', 'never'], 'system');
  result.defaultTarget = choice(input.defaultTarget, TARGETS, 'codex');
  result.display = typeof input.display === 'string' && /^(cursor|primary|-?\d{1,20})$/.test(input.display) ? input.display : 'cursor';
  return result;
}
function mergeSettings(current, patch) {
  patch = object(patch);
  const profiles = { ...current.profiles };
  for (const id of TARGETS) if (object(patch.profiles)[id]) profiles[id] = { ...profiles[id], ...object(patch.profiles[id]) };
  return normalize({ ...current, ...patch, profiles });
}
function selectEffect(settings, targetId, random = Math.random) {
  const profile = settings.profiles[targetId];
  const pool = settings.favorites.length ? settings.favorites : CATALOG.map(x => x.id);
  return profile.random ? pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))] : profile.effectId;
}
function validateTarget(id) {
  if (!TARGETS.includes(id)) throw new Error('Unknown target application.');
  return id;
}
function parseLaunchArgs(args) {
  const launch = args.find(x => /^--launch=(codex|chatgpt)$/.test(x));
  const preview = args.find(x => x.startsWith('--preview=') && EFFECT_IDS.has(x.slice(10)));
  return { targetId: launch?.split('=')[1] ?? null, previewEffect: preview?.slice(10) ?? null, hidden: args.includes('--hidden') };
}
function defaultsForLocale(locale = 'zh') {
  const defaults = clone(DEFAULTS);
  defaults.language = /^zh(?:[-_]|$)/i.test(String(locale)) ? 'zh' : 'en';
  return defaults;
}
class SettingsStore {
  constructor(directory, locale = 'zh') {
    this.directory = directory;
    this.file = path.join(directory, 'settings.json');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.defaults = defaultsForLocale(locale);
    this.value = clone(this.defaults);
    this.recoveryMessage = null;
    try {
      if (fs.statSync(this.file).size > 128 * 1024) throw new Error('Settings file is too large.');
      this.value = normalize({ language: this.defaults.language, ...object(JSON.parse(fs.readFileSync(this.file, 'utf8'))) });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.recoveryMessage = 'Settings could not be read. Defaults were restored and the old file was backed up.';
        this.backup('recovery');
      }
    }
  }
  get() { return clone(this.value); }
  reset() { return this.replace(this.defaults, true); }
  backup(label = 'backup') {
    if (!fs.existsSync(this.file)) return null;
    const destination = path.join(this.directory, `settings-${label}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`);
    fs.copyFileSync(this.file, destination);
    return destination;
  }
  replace(value, backup = false) {
    const normalized = normalize(value);
    if (backup) this.backup();
    const temporary = this.file + `.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(normalized, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temporary, this.file);
    this.value = normalized;
    return this.get();
  }
  patch(patch) { return this.replace(mergeSettings(this.value, patch)); }
}
module.exports = { DEFAULTS, CATALOG, EFFECT_IDS, TARGETS, normalize, mergeSettings, selectEffect, validateTarget, parseLaunchArgs, defaultsForLocale, SettingsStore };
