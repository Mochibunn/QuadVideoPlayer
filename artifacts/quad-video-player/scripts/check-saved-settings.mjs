import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../hooks/useSavedSetting.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function harness(storage) {
  const slots = [];
  const effects = [];
  const alerts = [];
  let cursor = 0;
  let changed = false;
  const react = {
    useState(initial) {
      const id = cursor++;
      if (!(id in slots)) slots[id] = typeof initial === 'function' ? initial() : initial;
      return [slots[id], (next) => {
        const value = typeof next === 'function' ? next(slots[id]) : next;
        if (value !== slots[id]) { slots[id] = value; changed = true; }
      }];
    },
    useRef(initial) {
      const id = cursor++;
      return slots[id] ??= { current: initial };
    },
    useCallback(callback) { cursor++; return callback; },
    useEffect(effect, deps) {
      const id = cursor++;
      const old = slots[id];
      if (!old || deps.some((v, i) => v !== old.deps[i])) {
        old?.cleanup?.();
        slots[id] = { deps };
        effects.push(() => { slots[id].cleanup = effect(); });
      }
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-native') return { Alert: { alert: (...args) => alerts.push(args) } };
      return storage;
    },
  });
  let result;
  function render() {
    cursor = 0;
    changed = false;
    result = exports.useSavedSetting('test-key', 1, (v) => Number(v));
    while (effects.length) effects.shift()();
    return result;
  }
  return {
    ...exports, alerts, render,
    async settle() {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
        if (changed) render();
      }
      return result;
    },
    close() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

test('saved value hydrates before any default is written', async () => {
  const writes = [];
  const app = harness({ getItem: async () => '7', setItem: async (...entry) => writes.push(entry) });
  assert.equal(app.render()[0], 1);
  assert.equal(writes.length, 0);
  const [value, setValue] = await app.settle();
  assert.equal(value, 7);
  assert.equal(writes.at(-1)[1], '7');
  setValue(12);
  await app.settle();
  assert.equal(writes.at(-1)[1], '12');
});

test('changing a setting while hydration is pending wins over older storage', async () => {
  let resolve;
  const writes = [];
  const app = harness({ getItem: () => new Promise((done) => { resolve = done; }), setItem: async (...entry) => writes.push(entry) });
  app.render()[1](25);
  await app.settle();
  resolve('3');
  const [value] = await app.settle();
  assert.equal(value, 25);
  assert.equal(writes.at(-1)[1], '25');
});

test('queued writes survive closing and a failed write does not block later saves', async () => {
  const writes = [];
  let finish;
  let first = true;
  const app = harness({
    getItem: async () => null,
    setItem: async (_key, value) => {
      writes.push(value);
      if (first) { first = false; await new Promise((resolve) => { finish = resolve; }); throw new Error('full'); }
    },
  });
  const one = app.writeSetting('ordered', 1).catch(() => {});
  const two = app.writeSetting('ordered', 2);
  await app.settle();
  app.close();
  assert.deepEqual(writes, ['1']);
  finish();
  await Promise.all([one, two]);
  assert.deepEqual(writes, ['1', '2']);
});

test('storage read errors do not overwrite existing preferences', async () => {
  const writes = [];
  const app = harness({ getItem: async () => { throw new Error('read failed'); }, setItem: async (...entry) => writes.push(entry) });
  app.render();
  const [, setValue, ready] = await app.settle();
  assert.equal(ready, false);
  setValue(4);
  await app.settle();
  assert.equal(writes.length, 0);
  assert.equal(app.alerts.length, 1);
});

test('reopening waits for the previous screen save before reading settings', async () => {
  let stored = '1';
  let finish;
  let first = true;
  let reads = 0;
  const app = harness({
    getItem: async () => { reads++; return stored; },
    setItem: async (_key, value) => {
      if (first) { first = false; await new Promise((resolve) => { finish = resolve; }); }
      stored = value;
    },
  });
  const save = app.writeSetting('test-key', 9);
  app.render();
  await app.settle();
  assert.equal(reads, 0);
  finish();
  await save;
  const [value] = await app.settle();
  assert.equal(value, 9);
  assert.equal(stored, '9');
});

test('all full-screen slots clear the measured global toolbar', async () => {
  const player = await readFile(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(player, /top: focusIndex !== null \|\| index < 2 \? toolbarHeight : 0/);
  assert.match(player, /onLayout=\{\(event\) => setToolbarHeight\(event\.nativeEvent\.layout\.height\)\}/);
  assert.match(player, /toolbarHeight=\{toolbarHeight\}/);
  assert.doesNotMatch(player, /top: index < 2 \? 60/);
});

test('AI cooldown preferences migrate with defaults and clamp unsafe values', async () => {
  const story = await readFile(new URL('../lib/local-story.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(story, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const { parseLocalStoryPreferences, clampAiCooldown } = await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const old = parseLocalStoryPreferences('{"autoQuestGeneration":true}');
  assert.equal(old.chatCooldownSeconds, 30);
  assert.equal(old.questCooldownMinutes, 15);
  assert.equal(old.honorCooldownMinutes, 30);
  assert.equal(old.cheerCooldownMinutes, 30);
  assert.equal(old.combatCooldownSeconds, 20);
  assert.equal(old.autoQuestGeneration, true);
  const parsed = parseLocalStoryPreferences(JSON.stringify({
    chatCooldownSeconds: -5, questCooldownMinutes: 999,
    honorCooldownMinutes: 2, cheerCooldownMinutes: 8, combatCooldownSeconds: 10,
  }));
  assert.equal(parsed.chatCooldownSeconds, 5);
  assert.equal(parsed.questCooldownMinutes, 60);
  assert.equal(parsed.honorCooldownMinutes, 2);
  assert.equal(parsed.cheerCooldownMinutes, 8);
  assert.equal(parsed.combatCooldownSeconds, 10);
  assert.equal(clampAiCooldown('chatCooldownSeconds', Infinity), 30);
  assert.equal(clampAiCooldown('combatCooldownSeconds', 27), 25);
});
