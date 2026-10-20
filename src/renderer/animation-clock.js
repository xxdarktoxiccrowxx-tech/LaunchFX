const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** One monotonic timeline for every motion mode; dropped frames do not extend it. */
export class AnimationClock {
  constructor(duration) {
    this.duration = Number.isFinite(duration) ? clamp(duration, 1.5, 15) : 6;
    this.startedAt = null;
    this.elapsed = 0;
  }
  start(now) { this.startedAt = now; this.elapsed = 0; }
  sample(now) {
    if (this.startedAt === null) this.start(now);
    this.elapsed = clamp(Math.max(this.elapsed, (now - this.startedAt) / 1000), 0, this.duration);
    return { elapsed: this.elapsed, progress: this.elapsed / this.duration, remaining: Math.max(0, Math.ceil(this.duration - this.elapsed)) };
  }
}

/** Reduced motion changes the picture, never the user-selected playback duration. */
export function sceneFrame(elapsed, progress, duration, reducedMotion) {
  if (!reducedMotion) return { time: elapsed, progress, opacity: 1 };
  const fade = Math.min(0.6, duration * 0.2);
  return {
    time: 2.8,
    progress: 0.48,
    opacity: smooth(0, fade, elapsed) * (1 - smooth(duration - fade, duration, elapsed))
  };
}
