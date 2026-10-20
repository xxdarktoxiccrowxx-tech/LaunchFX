import { EffectPlayer, EFFECT_IDS } from '../src/renderer/effects/engine.js';

const query = new URLSearchParams(location.search);
const requestedDuration = Number(query.get('duration') || 4);
const duration = Number.isFinite(requestedDuration) ? Math.max(1.5, Math.min(15, requestedDuration)) : 4;
const reduceMotion = ['always', 'never', 'system'].includes(query.get('reduce')) ? query.get('reduce') : 'never';
const effectId = EFFECT_IDS.includes(query.get('effect')) ? query.get('effect') : 'singularity';
const preview = query.get('mode') !== 'launch';
const $ = id => document.getElementById(id);
const round = value => Math.round(value * 1000) / 1000;
let firstRender = null, readyAt = null, lastRender = null, pixelMilestone = 0, lastTimelineSample = -Infinity, finishedAt = null, animationFrame = 0;
let frameCount = 0, previousFrame = null, maximumFrameGap = 0, checkpoint = null, completion = null;
const renderSamples = [], timelineSamples = [], errors = [], calls = [];
const pixelMilestones = [0, .2, .5, .8];
const startedAt = performance.now();

function report() {
  const actualDuration = finishedAt === null || firstRender === null ? null : round((finishedAt - (readyAt ?? firstRender)) / 1000);
  const result = {
    fixture: 'actual production overlay.js + overlay.html, mock IPC only',
    requestedDuration: duration, reduceMotion, effectId, mode: preview ? 'preview' : 'mock launch',
    realElapsedSeconds: actualDuration,
    elapsedFromFixtureStart: round(((finishedAt ?? performance.now()) - startedAt) / 1000),
    completed: completion !== null, completion,
    durationHonored: actualDuration === null ? null : Math.abs(actualDuration - duration) <= .25,
    firstSecond: checkpoint,
    animationFrames: frameCount,
    maximumFrameGapMs: round(maximumFrameGap),
    lastRender,
    finalCanvasOpacity: $('scene')?.style.opacity || null,
    distinctSampledFrames: new Set(renderSamples.map(sample => sample.hash)).size,
    renderSamples, timelineSamples, calls, errors,
    noNativeCalls: true, noDesktopCapture: true
  };
  $('report').textContent = JSON.stringify(result, null, 2);
  document.documentElement.dataset.timingComplete = String(completion !== null);
  document.documentElement.dataset.durationHonored = String(result.durationHonored);
  return result;
}

function checkpointAtOneSecond() {
  checkpoint = {
    observedAtSeconds: round((performance.now() - firstRender) / 1000),
    completedAlready: completion !== null,
    remainingLabel: $('remaining')?.textContent ?? null,
    progressTransform: $('progress')?.style.transform ?? null,
    canvasOpacity: $('scene')?.style.opacity || null,
    lastRender: lastRender ? { ...lastRender } : null
  };
  report();
}

function sample(player) {
  // Read a horizontal and vertical strip immediately after the actual draw.
  // This avoids a preserved drawing buffer and limits readback cost.
  const horizontal = new Uint8Array(player.width * 4), vertical = new Uint8Array(player.height * 4);
  if (player.gl && !player.lost && player.supported) {
    const gl = player.gl;
    gl.readPixels(0, Math.floor(player.height / 2), player.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, horizontal);
    gl.readPixels(Math.floor(player.width / 2), 0, 1, player.height, gl.RGBA, gl.UNSIGNED_BYTE, vertical);
  } else if (player.ctx) {
    horizontal.set(player.ctx.getImageData(0, Math.floor(player.height / 2), player.width, 1).data);
    vertical.set(player.ctx.getImageData(Math.floor(player.width / 2), 0, 1, player.height).data);
  }
  let hash = 2166136261, maximum = 0;
  for (const bytes of [horizontal, vertical]) {
    for (let i = 0; i < bytes.length; i += 4) {
      maximum = Math.max(maximum, bytes[i], bytes[i + 1], bytes[i + 2]);
      hash = Math.imul(hash ^ bytes[i], 16777619);
      hash = Math.imul(hash ^ bytes[i + 1], 16777619);
      hash = Math.imul(hash ^ bytes[i + 2], 16777619);
    }
  }
  return { hash: (hash >>> 0).toString(16), maximum };
}

const productionRender = EffectPlayer.prototype.render;
EffectPlayer.prototype.render = function(time, progress) {
  const now = performance.now();
  if (firstRender === null) {
    firstRender = now;
    setTimeout(checkpointAtOneSecond, 1000);
  }
  const value = productionRender.call(this, time, progress);
  lastRender = { wallSeconds: round((now - firstRender) / 1000), time: round(time), progress: round(progress), backend: this.backend };
  // GPU readback synchronizes rendering. Sample only a few milestones and never
  // block the final frame, so instrumentation does not inflate completion time.
  if (pixelMilestone < pixelMilestones.length && progress >= pixelMilestones[pixelMilestone] && progress < 1) {
    pixelMilestone++;
    renderSamples.push({ ...lastRender, ...sample(this) });
  }
  return value;
};

function stop(reason) {
  if (completion !== null) return;
  finishedAt = performance.now(); completion = reason;
  cancelAnimationFrame(animationFrame);
  report();
  $('fixture-running').hidden = true;
  $('fixture-report').hidden = false;
}

window.launchfx = Object.freeze({
  async overlayConfig() {
    calls.push({ method: 'overlayConfig', at: round((performance.now() - startedAt) / 1000) });
    return { effectId, targetName: 'Codex', targetId: 'codex', duration, intensity: .75, quality: 'eco', accent: '#86a8ff', seed: 42, desktopImage: null, preview, reducedMotion: reduceMotion === 'always', reduceMotion, sound: false, volume: 0, fpsLimit: 60, language: 'en' };
  },
  async overlayReady(...args) {
    readyAt = performance.now();
    calls.push({ method: 'overlayReady', args, at: round((performance.now() - startedAt) / 1000) });
    return { ok: true };
  },
  async finishOverlay(reason) {
    calls.push({ method: 'finishOverlay', reason, at: round((performance.now() - startedAt) / 1000) });
    stop(reason);
    return { ok: true };
  },
  async failOverlay(error) {
    errors.push(String(error));
    calls.push({ method: 'failOverlay', at: round((performance.now() - startedAt) / 1000) });
    stop('error');
    return { ok: true };
  }
});

window.addEventListener('error', event => { errors.push(event.message); stop('error'); });
window.addEventListener('unhandledrejection', event => { errors.push(String(event.reason)); stop('error'); });

const markup = await (await fetch('../src/renderer/overlay.html', { cache: 'no-store' })).text();
const parsed = new DOMParser().parseFromString(markup, 'text/html');
parsed.querySelectorAll('script').forEach(script => script.remove());
$('fixture-host').append(...Array.from(parsed.body.childNodes, node => document.importNode(node, true)));

function observeFrame(now) {
  if (completion !== null) return;
  if (firstRender !== null && previousFrame !== null && previousFrame >= firstRender) maximumFrameGap = Math.max(maximumFrameGap, now - previousFrame);
  previousFrame = now; frameCount++;
  if (firstRender !== null && now - lastTimelineSample >= 250) {
    lastTimelineSample = now;
    timelineSamples.push({ wallSeconds: round((now - (readyAt ?? firstRender)) / 1000), canvasOpacity: $('scene')?.style.opacity || null, progressTransform: $('progress')?.style.transform ?? null, remainingLabel: $('remaining')?.textContent ?? null });
  }
  animationFrame = requestAnimationFrame(observeFrame);
}
animationFrame = requestAnimationFrame(observeFrame);
setTimeout(() => { if (completion === null) { errors.push('Overlay failed to finish within its duration plus 8 seconds.'); stop('timeout'); } }, (duration + 8) * 1000);
// A simple local file server may allow heuristic browser caching. Every run must
// execute the saved production overlay, including immediately after a repair.
await import(`../src/renderer/overlay.js?timing=${Date.now()}`);
