import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/auto-chat-loop.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { startAutoChatLoop } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function clock() {
  let now = 0;
  const tasks = new Set();
  return {
    schedule(fn, delay) {
      const task = { fn, at: now + delay };
      tasks.add(task);
      return () => tasks.delete(task);
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const task = [...tasks].filter((item) => item.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!task) break;
        tasks.delete(task);
        now = task.at;
        task.fn();
        await Promise.resolve();
        await Promise.resolve();
      }
      now = end;
    },
  };
}

test('auto chat starts immediately and recurring replies survive frequent parent updates', async () => {
  const time = clock();
  let snapshot = { ready: true, callback: () => {} };
  let calls = 0;
  const stop = startAutoChatLoop({
    ready: () => snapshot.ready,
    run: async () => { calls++; snapshot.callback(); },
    onError: assert.fail,
  }, time.schedule);
  await time.advance(0);
  assert.equal(calls, 1);
  for (let i = 0; i < 90; i++) {
    snapshot = { ready: true, callback: () => {} };
    await time.advance(1_000);
  }
  assert.equal(calls, 4);
  stop();
  await time.advance(60_000);
  assert.equal(calls, 4);
});

test('busy model postpones a due reply without restarting its cooldown', async () => {
  const time = clock();
  let ready = false;
  let calls = 0;
  const stop = startAutoChatLoop({
    ready: () => ready, run: async () => { calls++; }, onError: assert.fail,
  }, time.schedule);
  await time.advance(8_000);
  assert.equal(calls, 0);
  ready = true;
  await time.advance(1_000);
  assert.equal(calls, 1);
  stop();
});

test('slow inference never overlaps and closing prevents another reply', async () => {
  const time = clock();
  let finish;
  let calls = 0;
  const stop = startAutoChatLoop({
    ready: () => true,
    run: () => { calls++; return new Promise((resolve) => { finish = resolve; }); },
    onError: assert.fail,
  }, time.schedule);
  await time.advance(90_000);
  assert.equal(calls, 1);
  stop();
  finish();
  await Promise.resolve();
  await time.advance(90_000);
  assert.equal(calls, 1);
});

test('model failure stops the loop and reports the error once', async () => {
  const time = clock();
  let failures = 0;
  startAutoChatLoop({
    ready: () => true,
    run: async () => { throw new Error('Model unavailable'); },
    onError: (error) => { assert.match(error.message, /unavailable/); failures++; },
  }, time.schedule);
  await time.advance(90_000);
  assert.equal(failures, 1);
});
