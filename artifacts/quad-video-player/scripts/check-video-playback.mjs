import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/video-playback.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const playback = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const videos = (count) => Array.from({ length: count }, (_, index) => ({
  id: `video-${index}`, uri: `file:///video-${index}.mp4`, name: `Video ${index}`,
}));

test('unwatched videos rank before every previously watched video', () => {
  const pool = videos(4).map((video, index) => ({ ...video, lastPlayedAt: index + 1 }));
  pool[2] = { ...pool[2], lastPlayedAt: undefined };
  assert.equal(playback.pickNextVideo(pool, pool[0].id)?.id, pool[2].id);
});

test('oldest watch time is prioritized and ties are shuffled independently', () => {
  const pool = videos(3).map((video) => ({ ...video, lastPlayedAt: 200 }));
  assert.equal(playback.pickNextVideo(pool, pool[0].id, new Set(), () => 0)?.id, pool[1].id);
  assert.equal(playback.pickNextVideo(pool, pool[0].id, new Set(), () => 0.999)?.id, pool[2].id);
  pool[2] = { ...pool[2], lastPlayedAt: 100 };
  assert.equal(playback.pickNextVideo(pool, pool[0].id)?.id, pool[2].id);
});

test('each initial quadrant gets a randomized, unique video when enough are available', () => {
  const pool = videos(8);
  const selected = playback.pickInitialVideos(pool, () => 0.71);
  assert.equal(selected.length, 4);
  assert.equal(new Set(selected.map((video) => video.id)).size, 4);
  const poolWithHistory = pool.map((video, index) => ({ ...video, lastPlayedAt: index + 1 }));
  const prioritized = playback.pickInitialVideos(poolWithHistory, () => 0);
  assert.deepEqual(prioritized.map((video) => video.id), ['video-0', 'video-1', 'video-2', 'video-3']);
});

test('next selection avoids the other active quadrants if an alternative exists', () => {
  const pool = videos(6).map((video, index) => ({ ...video, lastPlayedAt: index }));
  const selected = playback.pickNextVideo(pool, pool[0].id, new Set([pool[1].id, pool[2].id]));
  assert.equal(selected?.id, pool[3].id);
});

test('small pools still fill all four quadrants and never stop looping', () => {
  assert.equal(playback.pickInitialVideos(videos(1)).length, 4);
  assert.equal(playback.pickNextVideo(videos(1), 'video-0')?.id, 'video-0');
  assert.equal(playback.pickInitialVideos([]).length, 0);
});

test('watch history restores timestamps by local URI and rejects damaged JSON', () => {
  const raw = JSON.stringify({ 'file:///video-1.mp4': 123456, '/tmp/nope': 'invalid' });
  const history = playback.parseVideoWatchHistory(raw);
  const merged = playback.applyVideoWatchHistory(videos(3), history);
  assert.equal(merged[1].lastPlayedAt, 123456);
  assert.equal(merged[0].lastPlayedAt, undefined);
  assert.throws(() => playback.parseVideoWatchHistory('{'));
  assert.equal(playback.formatLastPlayed(undefined), 'Never played · prioritized');
});
