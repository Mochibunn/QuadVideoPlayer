import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/player-achievements.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const achievements = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('player ranks advance at their published level thresholds', () => {
  assert.equal(achievements.playerRankTitle(1), 'Denling');
  assert.equal(achievements.playerRankTitle(2), 'Denling');
  assert.equal(achievements.playerRankTitle(3), 'Gooner on the Prowl');
  assert.equal(achievements.playerRankTitle(5), 'Moonfang Regular');
  assert.equal(achievements.playerRankTitle(8), 'Wildpaw Adept');
  assert.equal(achievements.playerRankTitle(12), 'After-hours Enchanter');
  assert.equal(achievements.playerRankTitle(20), 'Grand Goonmancer');
});

test('achievement progress is derived from playback stats and unlocks at its target', () => {
  const empty = achievements.evaluatePlayerAchievements({
    completedSessions: 0, totalPlaybackMs: 0, bestSessionMs: 0, xp: 0, totalVideosWatched: 0, miniGamesWon: 0,
  });
  assert.equal(empty.length, 10);
  assert.equal(empty.filter((badge) => badge.unlocked).length, 0);

  const progress = achievements.evaluatePlayerAchievements({
    completedSessions: 1,
    totalPlaybackMs: 60 * 60_000,
    bestSessionMs: 60 * 60_000,
    xp: 90,
    totalVideosWatched: 25,
    miniGamesWon: 1,
  });
  assert.equal(progress.find((badge) => badge.id === 'first-clear').unlocked, true);
  assert.equal(progress.find((badge) => badge.id === 'timekeeper').unlocked, true);
  assert.equal(progress.find((badge) => badge.id === 'marathon').unlocked, true);
  assert.equal(progress.find((badge) => badge.id === 'level-ten').unlocked, true);
  assert.equal(progress.find((badge) => badge.id === 'clip-scout').unlocked, true);
  assert.equal(progress.find((badge) => badge.id === 'paw-parry-first').unlocked, true);
  assert.equal(progress.find((badge) => badge.id === 'ten-runs').progress, 1);
});

test('achievement progress is bounded and invalid stats cannot unlock rewards', () => {
  const result = achievements.evaluatePlayerAchievements({
    completedSessions: Infinity, totalPlaybackMs: -100, bestSessionMs: NaN, xp: 100_000,
    totalVideosWatched: -100, miniGamesWon: Infinity,
  });
  assert.equal(result.find((badge) => badge.id === 'first-clear').unlocked, false);
  assert.equal(result.find((badge) => badge.id === 'timekeeper').progress, 0);
  assert.equal(result.find((badge) => badge.id === 'level-ten').progress, 90);
  assert.equal(result.find((badge) => badge.id === 'clip-scout').progress, 0);
  assert.equal(result.find((badge) => badge.id === 'paw-parry-first').progress, 0);
});

test('AI achievement definitions are limited to real metrics and merge without duplicate names', () => {
  const accepted = achievements.parseGeneratedAchievements([
    { name: 'Clip Scout', description: 'duplicate built-in', metric: 'xp', target: 10 },
    { name: 'Moonlight Marathon', description: 'Watch a while.', metric: 'totalPlaybackMs', target: 600_000 },
    { name: 'Impossible', description: 'Bad target', metric: 'miniGamesWon', target: 999_999 },
    { name: 'Invented stat', description: 'Bad metric', metric: 'wallet', target: 1 },
  ], ['clip scout']);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].generated, true);
  assert.equal(accepted[0].metric, 'totalPlaybackMs');
});
