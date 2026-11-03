import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
async function load(name) {
  let source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  if (name === 'player-startup') {
    const mediaSource = await readFile(new URL('../lib/media-formats.ts', import.meta.url), 'utf8');
    const mediaCode = ts.transpileModule(mediaSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mediaUrl = `data:text/javascript;base64,${Buffer.from(mediaCode).toString('base64')}`;
    source = source.replace("from './media-formats'", `from '${mediaUrl}'`);
  }
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
  const value = slide.parseSlideshow({ scale: 900, opacity: -1, x: -5, y: 200, seconds: 0, speed: 100 }).instances[0];
  assert.equal(value.scale, 100); assert.equal(value.opacity, 0);
  assert.equal(value.x, 0); assert.equal(value.y, 100);
  assert.equal(value.seconds, 1); assert.equal(value.speed, 80);
});
test('each slideshow keeps its shuffle setting and chooses a different image randomly', () => {
  const parsed = slide.parseSlideshow({ instances: [
    { id: 'shuffled', shuffle: true }, { id: 'ordered', shuffle: false },
  ] });
  assert.equal(parsed.instances[0].shuffle, true);
  assert.equal(parsed.instances[1].shuffle, false);
  assert.equal(slide.nextSlideshowIndex(4, 2, false), 3);
  assert.equal(slide.nextSlideshowIndex(4, 3, false), 0);
  assert.equal(slide.nextSlideshowIndex(4, 2, true, () => 0), 0);
  assert.equal(slide.nextSlideshowIndex(4, 2, true, () => 0.999), 3);
  assert.notEqual(slide.nextSlideshowIndex(4, 2, true, () => 0.5), 2);
  assert.equal(slide.nextSlideshowIndex(1, 0, true), 0);
});
test('online slideshow pages prefetch near the end and space repeated requests', () => {
  assert.equal(slide.shouldPrefetchSlideshowPage(5, 5, 20, true, false, null), false);
  assert.equal(slide.shouldPrefetchSlideshowPage(16, 16, 20, true, false, null), true);
  assert.equal(slide.shouldPrefetchSlideshowPage(16, 16, 20, true, true, null), false);
  assert.equal(slide.shouldPrefetchSlideshowPage(18, 18, 20, true, false, 16), false);
  assert.equal(slide.shouldPrefetchSlideshowPage(0, 20, 1, true, false, 16), true);
  assert.equal(slide.shouldPrefetchSlideshowPage(0, 20, 1, false, false, null), false);
});
test('pool deduplicates URI selections and validates local addresses', () => {
  const value = slide.parseSlideshow({ pool: [image('a.gif'), image('a.gif'), image('b.jpg'),
    { name: 'bad', uri: 'https://external.test/image.jpg' }] });
  assert.equal(value.pool.length, 2);
});
test('a preserved pool index stays valid after restoring', () => {
  const value = slide.parseSlideshow({ pool: [image('a.gif'), image('b.jpg')], index: 17 });
  assert.equal(value.instances[0].index, 1);
});
test('position and scale stay in the viewport on tablet and PiP sizes', () => {
  for (const [width, height] of [[2960, 1848], [320, 200], [0, 0]]) {
    for (const scale of [10, 30, 100]) for (const x of [0, 50, 100]) for (const y of [0, 50, 100]) {
      const b = slide.slideshowBounds(width, height, { ...slide.DEFAULT_INSTANCE, scale, x, y });
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
test('legacy single-overlay sessions preserve their settings and master visibility', () => {
  const value = slide.parseSlideshow({ enabled: false, pool: [image('a.gif')], index: 0,
    scale: 47, opacity: 0.31, x: 13, y: 91, seconds: 19, speed: 42, bounce: false });
  assert.equal(value.enabled, false);
  assert.deepEqual(value.instances, [{ id: 'slideshow-1', enabled: true, index: 0,
    scale: 47, opacity: 0.31, x: 13, y: 91, seconds: 19, speed: 42, bounce: false, shuffle: false }]);
});
test('adding hundreds of independent bouncing overlays has no artificial count limit', () => {
  let value = slide.parseSlideshow({ pool: [image('a.gif'), image('b.jpg')] });
  for (let i = 0; i < 200; i++) value = slide.addSlideshow(value);
  assert.equal(value.instances.length, 201);
  assert.equal(new Set(value.instances.map((item) => item.id)).size, 201);
  assert.equal(value.pool.length, 2);
  assert.equal(value.enabled, true);
  assert.ok(value.instances.slice(1).every((item) => item.bounce && item.enabled));
  assert.equal(slide.parseSlideshow(JSON.parse(JSON.stringify(value))).instances.length, 201);
});
test('removing all instances remains empty on restore and adding works afterward', () => {
  const value = slide.parseSlideshow({ enabled: true, pool: [image('a.gif')], instances: [] });
  assert.equal(value.instances.length, 0);
  assert.equal(slide.addSlideshow(value).instances.length, 1);
});
test('new IDs do not collide after deleting an earlier instance', () => {
  let value = slide.addSlideshow(slide.addSlideshow(slide.parseSlideshow({})));
  value = { ...value, instances: value.instances.filter((item) => item.id !== 'slideshow-2') };
  value = slide.addSlideshow(value);
  assert.equal(new Set(value.instances.map((item) => item.id)).size, value.instances.length);
});
test('each saved instance retains independent settings and repaired unique IDs', () => {
  const value = slide.parseSlideshow({ enabled: true, pool: [image('a.gif'), image('b.jpg')], instances: [
    { ...slide.DEFAULT_INSTANCE, id: 'same', index: 0, seconds: 2, x: 10 },
    { ...slide.DEFAULT_INSTANCE, id: 'same', index: 1, seconds: 53, x: 90, enabled: false },
  ] });
  assert.notEqual(value.instances[0].id, value.instances[1].id);
  assert.equal(value.instances[0].seconds, 2);
  assert.equal(value.instances[1].seconds, 53);
  assert.equal(value.instances[1].enabled, false);
  assert.equal(value.instances[0].x, 10);
  assert.equal(value.instances[1].x, 90);
});
test('shared pool removal preserves each remaining current image without mutating originals', () => {
  const value = slide.parseSlideshow({ pool: [image('a.gif'), image('b.jpg'), image('c.webp')], instances: [
    { ...slide.DEFAULT_INSTANCE, id: 'a', index: 1 },
    { ...slide.DEFAULT_INSTANCE, id: 'b', index: 2 },
  ] });
  const result = slide.filterSlideshowPool(value, (item) => item.name !== 'a.gif');
  assert.deepEqual(result.instances.map((item) => item.index), [0, 1]);
  assert.equal(value.pool.length, 3);
  assert.deepEqual(value.instances.map((item) => item.index), [1, 2]);
});
test('saving samples live independent indices without forcing whole-app re-renders', () => {
  const value = slide.parseSlideshow({ pool: [image('a.gif'), image('b.jpg'), image('c.webp')], instances: [
    { ...slide.DEFAULT_INSTANCE, id: 'a', index: 0 },
    { ...slide.DEFAULT_INSTANCE, id: 'b', index: 0 },
    { ...slide.DEFAULT_INSTANCE, id: 'disabled', index: 1, enabled: false },
  ] });
  const result = slide.snapshotSlideshow(value, new Map([['a', { index: 2 }], ['b', { index: 1 }]]));
  assert.deepEqual(result.instances.map((item) => item.index), [2, 1, 1]);
  assert.deepEqual(value.instances.map((item) => item.index), [0, 0, 1]);
});
test('real overlay layers advance independently and stop timers/animations on removal', async () => {
  const timers = new Map();
  const runningAnimations = new Set();
  const runtime = { current: new Map() };
  const group = slide.parseSlideshow({ enabled: true, pool: [image('a.gif'), image('b.jpg'), image('c.webp')], instances: [
    { ...slide.DEFAULT_INSTANCE, id: 'first', seconds: 2 },
    { ...slide.DEFAULT_INSTANCE, id: 'second', seconds: 17, index: 1 },
  ] });
  let current;
  let nextTimer = 0;
  const react = {
    memo: (component) => component,
    useState(initial) {
      const runner = current, i = runner.cursor++;
      if (!(i in runner.hooks)) runner.hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [runner.hooks[i], (value) => { runner.hooks[i] = typeof value === 'function' ? value(runner.hooks[i]) : value; }];
    },
    useRef(initial) {
      const runner = current, i = runner.cursor++;
      if (!(i in runner.hooks)) runner.hooks[i] = { current: initial };
      return runner.hooks[i];
    },
    useCallback(callback, deps) {
      const runner = current, i = runner.cursor++;
      const old = runner.hooks[i];
      if (!old || deps.some((dep, j) => dep !== old.deps[j])) runner.hooks[i] = { callback, deps };
      return runner.hooks[i].callback;
    },
    useEffect(callback, deps) {
      const runner = current, i = runner.cursor++;
      const old = runner.hooks[i];
      if (!old || deps.some((dep, j) => dep !== old.deps[j])) {
        runner.effects.push(() => { old?.cleanup?.(); runner.hooks[i] = { deps, cleanup: callback() }; });
      }
    },
  };
  function runner() {
    const state = { hooks: [], cursor: 0, effects: [],
      render(component, props) {
        state.cursor = 0; state.effects = []; current = state;
        const result = component(props); current = undefined;
        state.effects.forEach((effect) => effect()); return result;
      },
      unmount() { state.hooks.forEach((hook) => hook?.cleanup?.()); },
    };
    return state;
  }
  const element = (type, props) => ({ type, props });
  const animated = {
    ValueXY: class {
      x = { interpolate: (v) => v }; y = { interpolate: (v) => v };
      stopAnimation() {} setValue() {}
    },
    View: 'AnimatedView',
    timing: (_value, config) => config,
    loop: () => {
      const animation = { start() { runningAnimations.add(animation); }, stop() { runningAnimations.delete(animation); } };
      return animation;
    },
  };
  const modules = {
    react: { ...react, __esModule: true, default: react },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'expo-image': { Image: 'Image' },
    'react-native': { Animated: animated, Easing: { linear: 'linear' }, Text: 'Text', View: 'View',
      StyleSheet: { create: (v) => v, absoluteFill: {} } },
    '@/components/GameText': { GameText: 'Text' },
    '@/hooks/useSlideshow': { useSlideshow: () => ({ slideshow: group, runtime, revision: 0 }) },
    '@/hooks/useOnlineSources': { useOnlineSources: () => ({ sources: [], results: {}, ensureLoaded() {} }) },
    '@/hooks/useColors': { useColors: () => ({ mutedForeground: 'muted' }) },
    '@/lib/slideshow': slide,
    '@/lib/bubble-physics': { bubbleWorld: { register() { return () => {}; } } },
  };
  const source = await readFile(new URL('../components/slideshow/SlideshowOverlay.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require(name) { assert.ok(modules[name], name); return modules[name]; },
    setInterval(callback, milliseconds) { timers.set(++nextTimer, { callback, milliseconds }); return nextTimer; },
    clearInterval(id) { timers.delete(id); },
  });
  const parent = runner();
  let root = parent.render(exports.default, { active: true });
  root.props.onLayout({ nativeEvent: { layout: { width: 2960, height: 1848 } } });
  root = parent.render(exports.default, { active: true });
  const layers = root.props.children;
  assert.equal(layers.length, 2);
  const first = runner(), second = runner();
  first.render(layers[0].type, layers[0].props);
  second.render(layers[1].type, layers[1].props);
  assert.equal(timers.size, 2);
  assert.equal(runningAnimations.size, 4);
  [...timers.values()].find((timer) => timer.milliseconds === 2000).callback();
  assert.equal(runtime.current.get('first').index, 1);
  assert.equal(runtime.current.get('second').index, 1);
  runtime.current.get('second').next();
  assert.equal(runtime.current.get('second').index, 2);
  assert.deepEqual(slide.snapshotSlideshow(group, runtime.current).instances.map((item) => item.index), [1, 2]);
  first.unmount();
  assert.equal(timers.size, 1);
  assert.equal(runningAnimations.size, 2);
  assert.equal(runtime.current.get('first').next, undefined);
  assert.equal(runtime.current.get('first').index, 1);
  second.unmount(); parent.unmount();
  assert.equal(timers.size, 0);
  assert.equal(runningAnimations.size, 0);
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
