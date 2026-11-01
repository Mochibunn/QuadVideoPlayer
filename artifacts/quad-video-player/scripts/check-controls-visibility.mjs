import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/controls-visibility.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { createControlsVisibility, CONTROLS_IDLE_MS, parseControlsHideSeconds } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

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

for (const releaseFirst of [true, false]) {
  test(`video tap toggles both directions with ${releaseFirst ? 'touch-end' : 'press'} dispatched first`, () => {
    const h = harness();
    h.controls.setBlocked(false);
    function tap() {
      h.controls.hold();
      if (releaseFirst) h.controls.release();
      h.controls.toggle();
      if (!releaseFirst) h.controls.release();
    }
    tap();
    assert.equal(h.visible, false);
    assert.equal(h.pending, 0);
    h.advance(CONTROLS_IDLE_MS * 2);
    h.controls.hold();
    assert.equal(h.visible, false, 'touch-down must not reveal controls before the completed tap');
    h.controls.release();
    tap();
    assert.equal(h.visible, true);
    assert.equal(h.pending, 1);
    h.advance(CONTROLS_IDLE_MS);
    assert.equal(h.visible, false);
  });
}

test('ordinary playback-button touches reset the timer without hiding controls', () => {
  const h = harness();
  h.controls.setBlocked(false);
  h.advance(CONTROLS_IDLE_MS - 1);
  h.controls.hold();
  h.advance(CONTROLS_IDLE_MS);
  assert.equal(h.visible, true);
  h.controls.release();
  h.advance(CONTROLS_IDLE_MS - 1);
  assert.equal(h.visible, true);
  h.advance(1);
  assert.equal(h.visible, false);
});

test('0 disables auto-hide but still allows manual tap toggling', () => {
  const h = harness();
  h.controls.setBlocked(false);
  h.controls.setDelaySeconds(0);
  h.advance(300000);
  assert.equal(h.visible, true);
  assert.equal(h.pending, 0);
  h.controls.toggle();
  assert.equal(h.visible, false);
  h.controls.toggle();
  assert.equal(h.visible, true);
  h.advance(300000);
  assert.equal(h.visible, true);
});

for (const seconds of [1, 12, 30]) {
  test(`the ${seconds}-second setting is applied to the actual deadline`, () => {
    const h = harness();
    h.controls.setBlocked(false);
    h.controls.setDelaySeconds(seconds);
    h.advance(seconds * 1000 - 1);
    assert.equal(h.visible, true);
    h.advance(1);
    assert.equal(h.visible, false);
  });
}

test('changing a delay cancels the previous deadline and can re-enable auto-hide', () => {
  const h = harness();
  h.controls.setBlocked(false);
  h.controls.setDelaySeconds(0);
  h.advance(100000);
  h.controls.setDelaySeconds(30);
  h.advance(CONTROLS_IDLE_MS);
  assert.equal(h.visible, true);
  assert.equal(h.pending, 1);
  h.controls.setDelaySeconds(1);
  h.advance(1000);
  assert.equal(h.visible, false);
});

test('saved delay values preserve 0 and clamp to whole seconds within 0–30', () => {
  for (const [input, expected] of [['0', 0], ['30', 30], ['12', 12], [8.7, 9], [-1, 0], [50, 30]]) {
    assert.equal(parseControlsHideSeconds(input), expected);
  }
  for (const input of [null, undefined, '', ' ', 'bad', Infinity, NaN, true]) {
    assert.equal(parseControlsHideSeconds(input), CONTROLS_IDLE_MS / 1000);
  }
});

test('menus and screen readers prevent manual hiding as well as idle hiding', () => {
  const h = harness();
  h.controls.setBlocked(true);
  h.controls.toggle();
  h.advance(300000);
  assert.equal(h.visible, true);
});
