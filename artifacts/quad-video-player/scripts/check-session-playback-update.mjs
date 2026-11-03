import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
async function load(name) {
  const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const history = await load('viewing-sessions');
const bpm = await load('bpm-cache');
const policy = await load('playback-policy');
const initial = () => ({ ...history.emptyViewingSessions(), active: {
  id: 'test-session', startedAtMs: 1000, elapsedMs: 1000, resumedAtMs: 2000, lastCheckpointMs: 2000, watchedVideoIds: [],
} });
test('single mode permits exactly its focused player, including late async callbacks', () => {
  for (let focus = 0; focus < 4; focus++) for (let slot = 0; slot < 4; slot++) {
    assert.equal(policy.slotMayPlay(true, focus, slot), focus === slot);
    assert.equal(policy.slotMayPlay(false, focus, slot), false);
  }
  for (let slot = 0; slot < 4; slot++) assert.equal(policy.slotMayPlay(true, null, slot), true);
});
test('real heart samples preserve min, weighted average, max through finish and JSON import', () => {
  let state = initial();
  for (const value of [80, 100, 120, 100]) state = history.recordHeartRate(state, value);
  const stats = state.active.heartRate;
  assert.deepEqual(stats, { min: 80, max: 120, sum: 400, count: 4 });
  state = history.recordWatchedVideos(state, ['a', 'a', 'b']);
  const finish = history.finishViewingSession(state, 10_000);
  assert.equal(finish.completed.watchedVideoCount, 2);
  assert.equal(finish.store.totalVideosWatched, 2);
  assert.deepEqual(finish.completed.heartRate, stats);
  const restored = history.parseViewingSessions(JSON.stringify(finish.store));
  assert.deepEqual(restored.heartRate, stats);
  assert.deepEqual(restored.leaderboard[0].heartRate, stats);
});
test('paused or invalid sensor values never enter HR statistics', () => {
  const state = initial();
  for (const value of [null, NaN, Infinity, 0, 19, 251, 80.5]) assert.equal(history.recordHeartRate(state, value), state);
  const paused = { ...state, active: { ...state.active, resumedAtMs: null } };
  assert.equal(history.recordHeartRate(paused, 90), paused);
});
test('legacy history derives available video totals but never invents old HR', () => {
  const old = { version: 1, totalPlaybackMs: 100, active: null,
    leaderboard: [{ id: 'old', startedAtMs: 1000, finishedAtMs: 2000, durationMs: 100, watchedVideoCount: 7 }] };
  const restored = history.parseViewingSessions(JSON.stringify(old));
  assert.equal(restored.totalVideosWatched, 7);
  assert.equal(restored.heartRate, null);
  assert.equal(restored.leaderboard[0].heartRate, null);
  assert.throws(() => history.parseViewingSessions(JSON.stringify({ ...old, heartRate: { min: 120, max: 90, sum: 100, count: 1 } })));
});
test('lifetime totals survive leaderboard truncation and multiple sessions', () => {
  let state = { ...initial(), totalVideosWatched: 300, heartRate: { min: 70, max: 80, sum: 150, count: 2 } };
  state = history.recordHeartRate(state, 100);
  state = history.recordWatchedVideos(state, ['x', 'y', 'z']);
  const finished = history.finishViewingSession(state, 10_000).store;
  assert.equal(finished.totalVideosWatched, 303);
  assert.deepEqual(finished.heartRate, { min: 70, max: 100, sum: 250, count: 3 });
});
test('BPM cache preserves unknown beats and averages only successful actual estimates', () => {
  const saved = bpm.parseBpmCache(JSON.stringify({
    a: { bpm: 120, confidence: 0.8 }, b: { bpm: null, confidence: 0.1 },
    c: { bpm: 140, confidence: 0.7 }, invalid: { bpm: 999, confidence: 1 },
    failed: { bpm: null, confidence: 0, error: 'No audio track' },
  }));
  assert.equal(saved.invalid, undefined);
  assert.equal(saved.b.bpm, null);
  assert.equal(bpm.averageVideoBpm([saved.a, saved.b, saved.c, saved.failed, undefined]), 130);
  assert.equal(bpm.averageVideoBpm([saved.b, undefined]), null);
  assert.throws(() => bpm.parseBpmCache('[]'));
});
