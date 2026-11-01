import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
async function load(name) {
  const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const slide = await load('slideshow');
const startup = await load('player-startup');
const image = (name) => ({ id: `content://images/${name}`, uri: `content://images/${name}`, name });
test('slideshow starts off and accepts common images and animated GIFs only', () => {
  assert.equal(slide.DEFAULT_SLIDESHOW.enabled, false);
  for (const name of ['a.jpg', 'b.PNG', 'c.GIF', 'd.webp', 'e.avif', 'f.heic']) {
    assert.equal(slide.isSlideshowImage({ name }), true);
  }
  for (const name of ['a.mp4', 'b.mp3', 'document.pdf']) assert.equal(slide.isSlideshowImage({ name }), false);
  assert.equal(slide.isSlideshowImage({ name: 'unknown', mimeType: 'image/gif' }), true);
});
test('parser bounds scale, opacity, position, interval and speed', () => {
  const value = slide.parseSlideshow({ scale: 900, opacity: -1, x: -5, y: 200, seconds: 0, speed: 100 });
  assert.equal(value.scale, 100); assert.equal(value.opacity, 0);
  assert.equal(value.x, 0); assert.equal(value.y, 100);
  assert.equal(value.seconds, 1); assert.equal(value.speed, 80);
});
test('pool deduplicates URI selections and validates local addresses', () => {
  const value = slide.parseSlideshow({ pool: [image('a.gif'), image('a.gif'), image('b.jpg'),
    { name: 'bad', uri: 'https://external.test/image.jpg' }] });
  assert.equal(value.pool.length, 2);
});
test('a preserved pool index stays valid after restoring', () => {
  const value = slide.parseSlideshow({ pool: [image('a.gif'), image('b.jpg')], index: 17 });
  assert.equal(value.index, 1);
});
test('position and scale stay in the viewport on tablet and PiP sizes', () => {
  for (const [width, height] of [[2960, 1848], [320, 200], [0, 0]]) {
    for (const scale of [10, 30, 100]) for (const x of [0, 50, 100]) for (const y of [0, 50, 100]) {
      const b = slide.slideshowBounds(width, height, { ...slide.DEFAULT_SLIDESHOW, scale, x, y });
      assert.ok(b.x >= 0 && b.y >= 0);
      assert.ok(b.x + b.width <= width + 0.001);
      assert.ok(b.y + b.height <= height + 0.001);
    }
  }
});
test('native bounce keyframes reflect at edges with seamless loop continuity', () => {
  for (const max of [1, 100, 2400]) for (const fraction of [0, 0.25, 0.5, 1]) {
    const start = max * fraction;
    const { inputRange, outputRange } = slide.bounceKeyframes(start, max);
    assert.equal(outputRange[0], start);
    assert.equal(outputRange.at(-1), start);
    assert.equal(inputRange[0], 0);
    assert.equal(inputRange.at(-1), 1);
    assert.ok(inputRange.every((v, i) => !i || v > inputRange[i - 1]));
    assert.ok(outputRange.every((v) => v >= 0 && v <= max));
    assert.ok(outputRange.includes(0) && outputRange.includes(max));
  }
});
test('zero travel at full-screen scale does not divide by zero', () => {
  const value = slide.bounceKeyframes(0, 0);
  assert.deepEqual(value, { inputRange: [0, 1], outputRange: [0, 0] });
});
function fakePlayer({ reject = false, deferred = false } = {}) {
  const calls = [];
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  return {
    calls, release,
    async replaceAsync(source) { calls.push(['load', source.uri]); if (reject) throw new Error('Decoder unavailable'); if (deferred) await pending; },
    play() { calls.push(['play']); }, pause() { calls.push(['pause']); },
  };
}
function fakeSchedule() {
  const tasks = new Map();
  const delays = [];
  let next = 0;
  return {
    tasks, delays,
    schedule(callback, delay) { tasks.set(++next, callback); delays.push(delay); return next; },
    cancel(id) { tasks.delete(id); },
    async run() { for (const [key, callback] of tasks) { tasks.delete(key); callback(); } await new Promise(setImmediate); },
  };
}
test('four startup loads are deferred and staggered rather than constructor-started', async () => {
  const timer = fakeSchedule();
  const players = Array.from({ length: 4 }, () => fakePlayer());
  players.forEach((p, i) => startup.prepareVideoSlot(p, `content://video/${i}`, i, () => true,
    () => assert.fail('unexpected error'), timer.schedule, timer.cancel));
  assert.deepEqual(timer.delays, [0, 200, 400, 600]);
  assert.ok(players.every((p) => !p.calls.length));
  await timer.run();
  assert.ok(players.every((p) => p.calls[0][0] === 'load' && p.calls[1][0] === 'play'));
});
test('load failure is reported without a play call or unhandled rejection', async () => {
  const p = fakePlayer({ reject: true }); const timer = fakeSchedule(); const errors = [];
  startup.prepareVideoSlot(p, 'content://bad', 0, () => true, (error) => errors.push(error), timer.schedule, timer.cancel);
  await timer.run();
  assert.equal(errors.length, 1);
  assert.equal(p.calls.length, 1);
});
test('canceling a slot before its scheduled load does no native work', async () => {
  const p = fakePlayer(); const timer = fakeSchedule();
  const stop = startup.prepareVideoSlot(p, 'content://video', 2, () => true,
    () => assert.fail(), timer.schedule, timer.cancel);
  stop(); await timer.run(); assert.equal(p.calls.length, 0);
});
test('unmounting during loading never plays a released player', async () => {
  const p = fakePlayer({ deferred: true }); const timer = fakeSchedule();
  const stop = startup.prepareVideoSlot(p, 'content://video', 0, () => true,
    () => assert.fail(), timer.schedule, timer.cancel);
  await timer.run(); stop(); p.release(); await new Promise(setImmediate);
  assert.equal(p.calls.length, 1);
});
test('the latest user pause intent is respected after preparing', async () => {
  const p = fakePlayer({ deferred: true }); const timer = fakeSchedule();
  let playing = true;
  startup.prepareVideoSlot(p, 'content://video', 0, () => playing,
    () => assert.fail(), timer.schedule, timer.cancel);
  await timer.run(); playing = false; p.release(); await new Promise(setImmediate);
  assert.equal(p.calls.at(-1)[0], 'pause');
});
test('per-player compressed read-ahead memory has explicit small bounds', () => {
  assert.equal(startup.QUAD_BUFFER_OPTIONS.maxBufferBytes * 4, 48 * 1024 * 1024);
  assert.equal(startup.AUDIO_BUFFER_OPTIONS.maxBufferBytes, 2 * 1024 * 1024);
  assert.equal(startup.QUAD_BUFFER_OPTIONS.prioritizeTimeOverSizeThreshold, false);
});
