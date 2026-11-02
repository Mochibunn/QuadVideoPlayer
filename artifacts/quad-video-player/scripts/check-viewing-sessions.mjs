import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../lib/viewing-sessions.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const model = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const running = (startedAtMs, elapsedMs, resumedAtMs, lastCheckpointMs) => ({
  version: 1, totalPlaybackMs: 123_000, leaderboard: [],
  active: { id: 'session-1', startedAtMs, elapsedMs, resumedAtMs, lastCheckpointMs },
});

test('elapsed loop time excludes pauses and resumes the same session', () => {
  const saved = model.parseViewingSessions(JSON.stringify(running(1000, 7000, 11000, 11000)));
  assert.equal(model.elapsedViewingTime(saved.active, 19000), 15000);
  const paused = model.recoverViewingSessions(saved, 19000);
  assert.equal(paused.active.id, 'session-1');
  assert.equal(paused.active.elapsedMs, 15000);
  assert.equal(paused.active.resumedAtMs, null);
  assert.equal(model.elapsedViewingTime(paused.active, 100000), 15000);
});
test('crash recovery never counts more than the recent checkpoint window', () => {
  const paused = model.recoverViewingSessions(model.parseViewingSessions(JSON.stringify(running(1, 3000, 5000, 2000))), 90_000);
  assert.equal(paused.active.elapsedMs, 18_000);
  assert.equal(paused.active.resumedAtMs, null);
});
test('ending a session adds its total once, keeps date and rank, and clears active state', () => {
  const result = model.finishViewingSession(model.parseViewingSessions(JSON.stringify(running(10_000, 3_000, 15_000, 15_000))), 22_000);
  assert.equal(result.completed.durationMs, 10_000);
  assert.equal(result.completed.startedAtMs, 10_000);
  assert.equal(result.completed.finishedAtMs, 22_000);
  assert.equal(result.store.totalPlaybackMs, 133_000);
  assert.equal(result.store.leaderboard[0].id, 'session-1');
  assert.equal(result.store.active, null);
  assert.equal(model.finishViewingSession(result.store, 23_000).completed, null);
});
test('tracks unique watched videos across saves and stores their count in the leaderboard', () => {
  const initial = model.parseViewingSessions(JSON.stringify(running(10_000, 3_000, 15_000, 15_000)));
  const tracked = model.recordWatchedVideos(initial, ['video-a', 'video-b', 'video-a']);
  assert.deepEqual(tracked.active.watchedVideoIds, ['video-a', 'video-b']);
  const restored = model.parseViewingSessions(JSON.stringify(tracked));
  assert.deepEqual(restored.active.watchedVideoIds, ['video-a', 'video-b']);
  const finished = model.finishViewingSession(restored, 22_000);
  assert.equal(finished.completed.watchedVideoCount, 2);
  assert.equal(finished.store.leaderboard[0].watchedVideoCount, 2);
});
test('celebration threshold is exactly one hour and duration stays readable beyond it', () => {
  assert.equal(model.VIEWING_ACHIEVEMENT_MS, 3_600_000);
  assert.equal(model.formatViewingTime(3_599_999), '59:59');
  assert.equal(model.formatViewingTime(999), '< 1s');
  assert.equal(model.formatViewingTime(3_600_000), '1:00:00');
  assert.equal(model.formatViewingTime(90_061_000), '25:01:01');
  assert.equal(model.formatViewingTime(-4), '00:00');
});
test('history is sorted by best score, preserves device-local date stamps, and caps to 100', () => {
  const sessions = Array.from({ length: 105 }, (_, id) => ({ id: `session-${id}`,
    startedAtMs: 1_700_000_000_000 + id, finishedAtMs: 1_700_100_000_000 + id, durationMs: id * 1000 }));
  const parsed = model.parseViewingSessions(JSON.stringify({ version: 1, totalPlaybackMs: 0, active: null, leaderboard: sessions.slice(0, 100) }));
  assert.equal(parsed.leaderboard.length, 100);
  assert.equal(parsed.leaderboard[0].durationMs, 99_000);
  assert.ok(model.localSessionDate(parsed.leaderboard[0].startedAtMs));
  const nextScore = parsed.leaderboard.length
    ? { ...parsed, active: { id: 'next-score', startedAtMs: sessions[0].startedAtMs,
      elapsedMs: 0, resumedAtMs: sessions[0].startedAtMs, lastCheckpointMs: sessions[0].startedAtMs,
      watchedVideoIds: [] } }
    : parsed;
  assert.equal(model.finishViewingSession(nextScore, sessions[0].startedAtMs + 2000).store.leaderboard.length, 100);
});
test('damaged records are rejected without silently clearing stored achievements', () => {
  for (const raw of ['{', '{"version":2,"totalPlaybackMs":0,"leaderboard":[],"active":null}',
    '{"version":1,"totalPlaybackMs":0,"leaderboard":[],"active":{"id":"bad","startedAtMs":"yesterday","elapsedMs":-1,"resumedAtMs":null,"lastCheckpointMs":0}}']) {
    assert.throws(() => model.parseViewingSessions(raw));
  }
  assert.deepEqual(model.parseViewingSessions(null), model.emptyViewingSessions());
});
