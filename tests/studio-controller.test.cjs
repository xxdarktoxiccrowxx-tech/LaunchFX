const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalize, mergeSettings } = require('../src/main/settings.cjs');
const catalog = require('../src/shared/catalog.json');
const studioFile = path.resolve(__dirname, '../src/renderer/studio.js');
const source = fs.readFileSync(studioFile, 'utf8').replace(/^import[^\n]*\n/, '');

// Run the real controller with inert DOM, graphics and IPC boundaries. These tests
// cover scheduling and persistence ordering; browser QA verifies actual pixels.
async function fixture() {
  const nodes = new Map(), rootEvents = new Map(), windowEvents = new Map();
  const frames = new Map(), players = [], mediaEvents = new Map();
  let nextFrame = 1, systemReduced = false, statusListener;
  const makeNode = (id = '') => ({
    id, style: {}, dataset: {}, classList: { add() {} }, append() {},
    addEventListener(name, fn) { if (id === 'app') rootEvents.set(name, fn); },
    setAttribute() {}, querySelector() { return { addEventListener() {} }; },
    replaceWith(node) { nodes.set(id, node); }, focus() {}, remove() {}
  });
  const app = makeNode('app');
  Object.defineProperty(app, 'innerHTML', {
    set(value) {
      this.html = value;
      for (const id of ['hero-canvas', 'effect-grid', 'gallery-count']) nodes.set(id, makeNode(id));
    },
    get() { return this.html; }
  });
  nodes.set('app', app);
  nodes.set('toasts', makeNode('toasts'));
  nodes.set('save-status', makeNode('save-status'));
  const document = {
    hidden: false, activeElement: null, documentElement: {}, body: { append() {} },
    getElementById: id => nodes.get(id) || null,
    createElement: () => makeNode(), querySelector: () => null, addEventListener() {}
  };
  let persisted = normalize({ language: 'en' }), fail = false, gate = null;
  const launches = [], previews = [], writes = [];
  const current = () => ({
    settings: structuredClone(persisted), catalog,
    apps: [{ id: 'codex', installed: true }, { id: 'chatgpt', installed: true }],
    capabilities: { accessibilityTrusted: true }, platform: 'darwin', version: 'test',
    displays: [], diagnostics: {}
  });
  const api = {
    getState: async () => current(),
    saveSettings: async patch => {
      writes.push(structuredClone(patch));
      if (gate) await gate;
      if (fail) throw new Error('disk unavailable');
      persisted = mergeSettings(persisted, patch);
      return structuredClone(persisted);
    },
    launch: async id => launches.push({ id, duration: persisted.profiles[id].duration }),
    preview: async data => previews.push(data),
    onStateChanged() {},
    onLaunchStatus(listener) { statusListener = listener; }
  };
  class Player {
    constructor(canvas, options) {
      this.canvas = canvas; this.options = options;
      this.renders = 0; this.resizes = 0; this.destroyed = false;
      players.push(this);
    }
    render() { this.renders++; }
    resize() { this.resizes++; }
    setOptions(options) { this.options = options; }
    setEffect() {}
    destroy() { this.destroyed = true; }
  }
  const context = {
    EffectPlayer: Player,
    window: { launchfx: api, scrollY: 0, scrollTo() {}, addEventListener: (name, fn) => windowEvents.set(name, fn) },
    document, navigator: { language: 'en' }, console,
    matchMedia: () => ({
      get matches() { return systemReduced; },
      addEventListener: (name, fn) => mediaEvents.set(name, fn)
    }),
    requestAnimationFrame: fn => { const id = nextFrame++; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id), setTimeout: () => 1, clearTimeout() {}
  };
  vm.createContext(context);
  const ui = await vm.runInContext(`(async () => {\n${source}\nreturn {save,action,saveIndicator,controlPanel,S,hero:()=>hero};\n})()`, context, { filename: studioFile });
  assert.ok(ui.hero(), 'studio must boot before exercising its controller');
  return {
    ui, players, frames, launches, previews, writes, rootEvents, windowEvents,
    status: phase => statusListener({ phase }),
    setFail: value => { fail = value; },
    setGate: value => { gate = value; },
    setReduced(value) { systemReduced = value; mediaEvents.get('change')?.(); }
  };
}

test('studio retains its hero and pauses all background frames during launch, then resumes', async () => {
  const f = await fixture();
  const hero = f.ui.hero(), initialRenders = hero.renders;
  assert.equal(f.frames.size, 2, 'hero and poster work are initially scheduled');
  f.status('playing');
  assert.equal(f.ui.hero(), hero);
  assert.equal(f.frames.size, 0);
  assert.equal(hero.renders, initialRenders);
  assert.equal(hero.destroyed, false);
  f.windowEvents.get('focus')();
  f.windowEvents.get('resize')();
  f.setReduced(true);
  f.status('opening');
  assert.equal(hero.renders, initialRenders);
  assert.equal(f.frames.size, 0);
  assert.match(f.ui.controlPanel(), /selected duration/);
  f.status('done');
  assert.equal(f.ui.hero(), hero);
  assert.ok(hero.renders > initialRenders);
  assert.equal(f.players.filter(player => player.canvas.id === 'hero-canvas').length, 1);
});

test('launch waits for an in-flight duration save and uses the new value', async () => {
  const f = await fixture();
  let release;
  f.setGate(new Promise(resolve => { release = resolve; }));
  f.rootEvents.get('change')({ target: { dataset: { setting: 'profiles.codex.duration' }, type: 'range', value: '10' } });
  const launching = f.ui.action('launch', { dataset: {} });
  await Promise.resolve();
  assert.equal(f.launches.length, 0);
  release();
  await launching;
  assert.equal(f.launches[0].duration, 10);
});

test('a failed save blocks stale launch and preview until Retry save succeeds', async () => {
  const f = await fixture();
  f.setFail(true);
  await f.ui.save({ profiles: { codex: { duration: 10 } } });
  assert.equal(f.ui.S().profiles.codex.duration, 10, 'keep the requested value available for retry');
  assert.match(f.ui.saveIndicator(), /Retry save/);
  await assert.rejects(() => f.ui.action('launch', { dataset: {} }), /Retry save/);
  await assert.rejects(() => f.ui.action('preview', { dataset: {} }), /Retry save/);
  assert.equal(f.launches.length, 0);
  assert.equal(f.previews.length, 0);
  f.setFail(false);
  await f.ui.action('retry-save', { dataset: {} });
  assert.doesNotMatch(f.ui.saveIndicator(), /Retry save/);
  await f.ui.action('launch', { dataset: {} });
  assert.equal(f.launches[0].duration, 10);
});

test('a later settings edit retries the earlier unsaved duration without losing either change', async () => {
  const f = await fixture();
  f.setFail(true);
  await f.ui.save({ profiles: { codex: { duration: 4 } } });
  f.setFail(false);
  await f.ui.save({ quality: 'eco' });
  assert.equal(f.writes[1].profiles.codex.duration, 4);
  assert.equal(f.writes[1].quality, 'eco');
  assert.equal(f.ui.S().profiles.codex.duration, 4);
  await f.ui.action('launch', { dataset: {} });
  assert.equal(f.launches[0].duration, 4);
});
