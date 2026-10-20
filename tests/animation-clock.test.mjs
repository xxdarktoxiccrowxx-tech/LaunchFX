import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationClock, sceneFrame } from '../src/renderer/animation-clock.js';

for (const duration of [4, 10]) {
  for (const reduced of [false, true]) {
    test(`${duration}s playback keeps its deadline with reduced motion ${reduced}`, () => {
      const clock = new AnimationClock(duration);
      clock.start(500);
      const atOne = clock.sample(1500);
      assert.equal(atOne.elapsed, 1);
      assert.equal(atOne.progress, 1 / duration);
      assert.ok(sceneFrame(atOne.elapsed, atOne.progress, duration, reduced).opacity > 0.99);
      assert.ok(clock.sample(500 + duration * 1000 - 1).progress < 1);
      const end = clock.sample(500 + duration * 1000);
      assert.equal(end.progress, 1);
      assert.equal(end.remaining, 0);
      if (reduced) assert.equal(sceneFrame(end.elapsed, end.progress, duration, reduced).opacity, 0);
    });
  }
}
test('long dropped-frame gaps catch up to real time and never advance twice', () => {
  const clock = new AnimationClock(10);
  clock.start(1000);
  assert.equal(clock.sample(1016).progress, 0.0016);
  assert.equal(clock.sample(8000).progress, 0.7);
  assert.equal(clock.sample(7900).progress, 0.7);
  assert.equal(clock.sample(19000).progress, 1);
});
test('reduced motion holds a visible scene while normal motion progresses', () => {
  const early = sceneFrame(1, 0.1, 10, true);
  const late = sceneFrame(8, 0.8, 10, true);
  assert.deepEqual(early, late);
  assert.equal(early.progress, 0.48);
  assert.equal(early.opacity, 1);
  assert.equal(sceneFrame(0, 0, 10, true).opacity, 0);
  assert.equal(sceneFrame(3, 0.3, 10, false).progress, 0.3);
});
