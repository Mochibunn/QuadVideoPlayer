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
  assert.equal(achievements.playerRankTitle(1), 'Rookie');
  assert.equal(achievements.playerRankTitle(2), 'Rookie');
  assert.equal(achievements.playerRankTitle(3), 'Loop Runner');
  assert.equal(achievements.playerRankTitle(5), 'Arcade Ace');
  assert.equal(achievements.playerRankTitle(20), 'Loop Legend');
});

test('achievement progress is derived from playback stats and unlocks at its target', () => {
  const empty = achievements.evaluatePlayerAchievements({
    completedSessions: 0, totalPlaybackMs: 0, bestSessionMs: 0, xp: 0,
  });
  assert.equal(empty.length, 6);
  assert.equal(empty.filter((badge) => badge.unlocked).length, 0);

  const progress = achievements.evaluatePlayerAchievements({
    completedSessions: 1,
    totalPlaybackMs: 60 * 60_000,
    bestSessionMs: 60 * 60_000,
    xp: 90,
  });
  assert.equal(progress.find((badge) => badge.id === 'first-clear').unlocked, true);
  assert.equal(progress.find((badge) => badge.id === 'timekeeper').unlocked, true);
  assert.equal(progress.find((badge) => badge.id === 'marathon').unlocked, true);
  assert.equal(progress.find((badge) => badge.id === 'level-ten').unlocked, true);
  assert.equal(progress.find((badge) => badge.id === 'ten-runs').progress, 1);
});

test('achievement progress is bounded and invalid stats cannot unlock rewards', () => {
  const result = achievements.evaluatePlayerAchievements({
    completedSessions: Infinity, totalPlaybackMs: -100, bestSessionMs: NaN, xp: 100_000,
  });
  assert.equal(result.find((badge) => badge.id === 'first-clear').unlocked, false);
  assert.equal(result.find((badge) => badge.id === 'timekeeper').progress, 0);
  assert.equal(result.find((badge) => badge.id === 'level-ten').progress, 90);
});
