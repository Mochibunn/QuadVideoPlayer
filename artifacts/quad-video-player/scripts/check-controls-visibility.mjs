import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/controls-visibility.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { createControlsVisibility, CONTROLS_IDLE_MS } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function harness() {
  let now = 0;
  let visible = true;
  let changes = 0;
  let nextId = 0;
  const pending = new Map();
  const schedule = (callback, delay) => {
    const id = nextId++;
    pending.set(id, { at: now + delay, callback });
    return () => pending.delete(id);
  };
  const controls = createControlsVisibility((value) => {
    visible = value;
    changes++;
  }, schedule);
  return {
    controls,
    get visible() { return visible; },
    get changes() { return changes; },
    get pending() { return pending.size; },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const due = [...pending.entries()].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].callback();
      }
      now = end;
    },
  };
}

test('controls stay visible before videos are loaded', () => {
  const h = harness();
  h.advance(100000);
  assert.equal(h.visible, true);
  assert.equal(h.pending, 0);
});

test('controls hide after the idle interval, not before', () => {
  const h = harness();
  h.controls.setBlocked(false);
  h.advance(CONTROLS_IDLE_MS - 1);
  assert.equal(h.visible, true);
  h.advance(1);
  assert.equal(h.visible, false);
});

test('tapping a video restores controls and starts a fresh interval', () => {
  const h = harness();
  h.controls.setBlocked(false);
  h.advance(CONTROLS_IDLE_MS);
  h.controls.reveal();
  assert.equal(h.visible, true);
  h.advance(CONTROLS_IDLE_MS - 1);
  assert.equal(h.visible, true);
  h.advance(1);
  assert.equal(h.visible, false);
});

test('holding a volume control prevents hiding until release', () => {
  const h = harness();
  h.controls.setBlocked(false);
  h.controls.hold();
  h.advance(CONTROLS_IDLE_MS * 10);
  assert.equal(h.visible, true);
  assert.equal(h.pending, 0);
  h.controls.reveal();
  assert.equal(h.pending, 0);
  h.controls.release();
  h.advance(CONTROLS_IDLE_MS);
  assert.equal(h.visible, false);
});

test('repeated interaction cancels old deadlines instead of accumulating timers', () => {
  const h = harness();
  h.controls.setBlocked(false);
  h.advance(CONTROLS_IDLE_MS - 10);
  h.controls.hold();
  h.controls.release();
  h.advance(10);
  assert.equal(h.visible, true);
  assert.equal(h.pending, 1);
  h.advance(CONTROLS_IDLE_MS - 10);
  assert.equal(h.visible, false);
});

test('menus, pickers and accessibility mode keep controls visible', () => {
  const h = harness();
  h.controls.setBlocked(false);
  h.advance(CONTROLS_IDLE_MS);
  h.controls.setBlocked(true);
  h.advance(CONTROLS_IDLE_MS * 10);
  assert.equal(h.visible, true);
  assert.equal(h.pending, 0);
  h.controls.setBlocked(false);
  h.advance(CONTROLS_IDLE_MS);
  assert.equal(h.visible, false);
});

test('returning from a picker clears a cancelled touch hold', () => {
  const h = harness();
  h.controls.setBlocked(false);
  h.controls.hold();
  h.controls.setBlocked(true);
  h.controls.setBlocked(false);
  h.advance(CONTROLS_IDLE_MS);
  assert.equal(h.visible, false);
});

test('unmount cleanup cancels callbacks', () => {
  const h = harness();
  h.controls.setBlocked(false);
  const before = h.changes;
  h.controls.dispose();
  h.advance(CONTROLS_IDLE_MS * 10);
  assert.equal(h.changes, before);
  assert.equal(h.pending, 0);
});
