import { EffectPlayer } from './effects/engine.js';
import { AnimationClock, sceneFrame } from './animation-clock.js';

const api = window.launchfx;
const root = document.getElementById('experience');
const canvas = document.getElementById('scene');
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const L = (zh, en) => config?.language === 'en' ? en : zh;
const labels = {
  singularity: ['黑洞奇点', 'SINGULARITY'], quantum: ['量子跃迁', 'QUANTUM LEAP'],
  aurora: ['极光轻幕', 'AURORA'], warp: ['曲速穿梭', 'WARP DRIVE'],
  matrix: ['代码之雨', 'CODE RAIN'], portal: ['棱镜之门', 'PRISM PORTAL'],
  eclipse: ['日蚀之光', 'ECLIPSE'], nebula: ['星云绽放', 'NEBULA BLOOM'],
  ripple: ['引力涟漪', 'GRAVITY RIPPLE'], orbit: ['星环轨道', 'ORBITAL'],
  ink: ['流墨归一', 'LIQUID INK'], constellation: ['群星汇聚', 'CONSTELLATION']
};
let config, player, clock, frame = 0, finished = false, lastDraw = -Infinity;
let audio = null, staticPainted = false;

function tone() {
  if (!config.sound || config.preview || config.reducedMotion) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audio = new AudioContext();
    const master = audio.createGain();
    master.gain.value = Math.min(.25, Math.max(0, config.volume || 0) * .18);
    master.connect(audio.destination);
    const now = audio.currentTime;
    [72, 108, 144.3].forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.3, now + clock.duration * .76);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(.28 / (index + 1), now + .8);
      gain.gain.exponentialRampToValueAtTime(.0001, now + clock.duration);
      oscillator.connect(gain); gain.connect(master);
      oscillator.start(now); oscillator.stop(now + clock.duration + .2);
    });
    audio.resume().catch(() => {});
  } catch { audio = null; }
}
function stopAudio() { audio?.close().catch(() => {}); audio = null; }
function cleanup() { cancelAnimationFrame(frame); player?.destroy(); stopAudio(); }
function showError(error) {
  const node = document.getElementById('error');
  node.hidden = false;
  node.textContent = error?.message || String(error);
}
async function fail(error) {
  if (finished) return;
  finished = true;
  cancelAnimationFrame(frame); stopAudio();
  showError(error);
  try { await api.failOverlay(error?.message || String(error)); }
  catch (failure) { showError(failure); }
}
async function finish(reason) {
  if (finished) return;
  finished = true;
  root.classList.add('ending');
  cancelAnimationFrame(frame); stopAudio();
  // The main process removes this overlay before waiting for native window control.
  try { await api.finishOverlay(reason); }
  catch (error) { showError(error); }
}
function draw(sample) {
  if (!player?.supported || player.lost) throw new Error(L('图形渲染已中断，请重试或选择节能画质。', 'Graphics rendering was interrupted. Try again or select Eco quality.'));
  const { elapsed, progress, remaining } = sample;
  const scene = sceneFrame(elapsed, progress, clock.duration, config.reducedMotion);
  const chrome = config.preview ? 1 : 1 - smooth(.76, 1, progress);
  const arrival = smooth(.72, .86, progress) * (1 - smooth(.97, 1, progress));
  root.style.setProperty('--chrome', chrome.toFixed(4));
  root.style.setProperty('--arrival', arrival.toFixed(4));
  root.style.setProperty('--arrival-blur', config.reducedMotion ? '0px' : `${((1 - arrival) * 8).toFixed(2)}px`);
  document.getElementById('arrival').setAttribute('aria-hidden', String(arrival < .2));
  document.getElementById('progress').style.transform = `scaleX(${progress})`;
  document.getElementById('remaining').textContent = String(remaining).padStart(2, '0');
  document.getElementById('stage').textContent = progress < .24 ? L('开启', 'BEGIN') : progress < .72 ? (config.reducedMotion ? L('静谧画面', 'STILL SCENE') : L('穿越', 'IN MOTION')) : L('即将抵达', 'ARRIVING');
  canvas.style.opacity = String(scene.opacity);
  if (!config.reducedMotion || !staticPainted) {
    player.render(scene.time, scene.progress);
    staticPainted = true;
  }
}
function tick(now) {
  if (finished) return;
  try {
    const sample = clock.sample(now);
    if (now - lastDraw >= 1000 / (config.fpsLimit || 60) - 1 || sample.progress >= 1) {
      draw(sample); lastDraw = now;
    }
    if (sample.progress >= 1) { finish('finish'); return; }
    frame = requestAnimationFrame(tick);
  } catch (error) { fail(error); }
}
document.getElementById('skip').addEventListener('click', () => finish(config?.preview ? 'cancel' : 'skip'));
document.getElementById('cancel').addEventListener('click', () => finish('cancel'));
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); finish(config?.preview ? 'cancel' : 'skip'); }
});
canvas.addEventListener('webglcontextlost', () => fail(new Error(L('图形连接已中断，启动已取消。请重试或选择节能画质。', 'The graphics context was lost. Launch cancelled; try again or select Eco quality.'))));
window.addEventListener('resize', () => {
  if (!config || !clock || finished) return;
  try { player?.resize(); staticPainted = false; draw(clock.sample(performance.now())); }
  catch (error) { fail(error); }
});
window.addEventListener('beforeunload', cleanup);

try {
  config = await api.overlayConfig();
  if (!config || finished) throw new Error('Preview closed.');
  config.reducedMotion = config.reduceMotion === 'always' || (config.reduceMotion === 'system' ? matchMedia('(prefers-reduced-motion: reduce)').matches : config.reduceMotion === 'never' ? false : Boolean(config.reducedMotion));
  clock = new AnimationClock(config.duration);
  document.documentElement.lang = config.language === 'en' ? 'en' : 'zh-CN';
  root.classList.toggle('reduced-motion', config.reducedMotion);
  document.getElementById('target-name').textContent = config.targetName;
  document.getElementById('effect-label').textContent = (labels[config.effectId] || ['启动特效', 'Opening scene'])[config.language === 'en' ? 1 : 0];
  document.getElementById('arrival-copy').textContent = config.preview ? L('预览结束后返回工坊。', 'Return to your studio after this preview.') : L('新的空间，即将展开。', 'A new space for your ideas.');
  document.getElementById('mode-label').textContent = config.reducedMotion ? L('柔和淡入淡出', 'GENTLE FADE') : config.preview ? L('特效预览', 'EFFECT PREVIEW') : config.desktopImage ? L('桌面转场', 'DESKTOP TRANSITION') : L('专属开场', 'YOUR OPENING SCENE');
  document.getElementById('skip-label').textContent = config.preview ? L('关闭预览', 'Close preview') : L('跳过', 'Skip');
  root.setAttribute('aria-label', config.preview ? L('特效预览', 'Effect preview') : L('启动特效', 'Launch animation'));
  document.getElementById('arrival-eyebrow').textContent = config.preview ? L('预览', 'PREVIEW') : L('准备开启', 'READY FOR WHAT’S NEXT');
  const cancelLabel = config.preview ? L('关闭预览', 'Close preview') : L('取消启动', 'Cancel launch');
  document.getElementById('cancel').setAttribute('aria-label', cancelLabel);
  document.getElementById('cancel').title = cancelLabel;
  document.getElementById('preview-badge').hidden = !config.preview;
  document.getElementById('preview-badge').textContent = L('不会打开应用', 'NO APP WILL OPEN');
  document.getElementById('status').textContent = config.preview ? L('开始预览。按 Esc 关闭预览。', 'Preview started. Press Escape to close it.') : L('启动特效开始。按 Esc 跳过并打开应用。', 'Launch animation started. Press Escape to skip and open the app.');
  player = new EffectPlayer(canvas, { ...config, retainFrame: config.reducedMotion });
  if (config.desktopImage) { await player.setDesktopImage(config.desktopImage); config.desktopImage = null; }
  if (!finished) {
    staticPainted = false;
    draw({ elapsed: 0, progress: 0, remaining: Math.ceil(clock.duration) });
    // Warm the GPU while hidden; count the chosen duration only after the window is ready.
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (!finished) {
      await api.overlayReady();
      if (!finished) { clock.start(performance.now()); tone(); frame = requestAnimationFrame(tick); }
    }
  }
} catch (error) { if (!finished) fail(error); }
