import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/player-rewards.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const model = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const soundSource = await readFile(new URL('../lib/sound-settings.ts', import.meta.url), 'utf8');
const { outputText: soundOutput } = ts.transpileModule(soundSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const sound = await import(`data:text/javascript;base64,${Buffer.from(soundOutput).toString('base64')}`);

test('XP is awarded only for each complete playback minute', () => {
  assert.equal(model.experienceForPlayback(0, 59_999), 0);
  assert.equal(model.experienceForPlayback(0, 60_000), 1);
  assert.equal(model.experienceForPlayback(120_000, 60_000), 3);
  assert.equal(model.experienceForPlayback(-10, Number.NaN), 0);
});

test('levels advance every ten XP and border rewards unlock in order', () => {
  assert.equal(model.levelForExperience(0), 1);
  assert.equal(model.levelForExperience(9), 1);
  assert.equal(model.levelForExperience(10), 2);
  assert.equal(model.levelForExperience(30), 4);
  assert.equal(model.experienceUntilNextLevel(19), 1);
  assert.equal(model.isBorderUnlocked('gamecubed', 0), true);
  assert.equal(model.isBorderUnlocked('arcade', 9), false);
  assert.equal(model.isBorderUnlocked('arcade', 10), true);
  assert.equal(model.isBorderUnlocked('puzzled', 20), true);
  assert.equal(model.isBorderUnlocked('nebula', 30), true);
  assert.equal(model.isBorderUnlocked('prism', 39), false);
  assert.equal(model.isBorderUnlocked('aurora', 50), true);
  assert.equal(model.isThemeUnlocked('amethyst', 0), true);
  assert.equal(model.isThemeUnlocked('silver', 9), false);
  assert.equal(model.isThemeUnlocked('silver', 10), true);
  assert.equal(model.isThemeUnlocked('olive-mist', 50), true);
  assert.equal(model.isBorderUnlocked('aurora', 0, true), true);
  assert.equal(model.isThemeUnlocked('olive-mist', 0, true), true);
  assert.equal(model.nextRewardMilestone(9).level, 2);
  assert.equal(model.nextRewardMilestone(50), null);
});

test('session milestones fire once per ten active minutes', () => {
  assert.equal(model.nextSessionMilestone(599_999, 0), null);
  assert.equal(model.nextSessionMilestone(600_000, 0), 600_000);
  assert.equal(model.nextSessionMilestone(610_000, 600_000), null);
  assert.equal(model.nextSessionMilestone(1_200_000, 600_000), 1_200_000);
});

test('congratulations messages rotate by milestone and use a safe fallback', () => {
  assert.equal(model.congratulationsFor('First\nSecond', 600_000), 'First');
  assert.equal(model.congratulationsFor('First\nSecond', 1_200_000), 'Second');
  assert.equal(model.congratulationsFor(' \n ', 600_000), 'Great work reaching this milestone!');
  assert.equal(model.messagesForCongratText(' a \n\n b ').length, 2);
});

test('saved settings are validated and scroll speed is clamped', () => {
  const value = model.parsePlayerRewards(JSON.stringify({
    borderEnabled: true, borderStyle: 'puzzled', scrollBorder: true,
    scrollDirection: 'down', scrollSpeed: 99, textureScale: 3.4, congratsText: 'Hello',
  }));
  assert.equal(value.borderEnabled, true);
  assert.equal(value.borderStyle, 'puzzled');
  assert.equal(value.scrollDirection, 'down');
  assert.equal(value.scrollSpeed, 10);
  assert.equal(value.textureScale, 2.5);
  assert.equal(value.congratsText, 'Hello');
  assert.equal(model.parsePlayerRewards(null).borderStyle, 'gamecubed');
  assert.equal(model.parsePlayerRewards(null).textureScale, 1);
  assert.equal(model.parsePlayerRewards(JSON.stringify({ textureScale: 0.1 })).textureScale, 0.5);
  assert.equal(model.parsePlayerRewards(JSON.stringify({ allRewardsUnlocked: true })).allRewardsUnlocked, true);
});

test('advanced EQ rewards are well-formed five-band presets', () => {
  assert.equal(model.ADVANCED_EQ_UNLOCK_LEVEL, 5);
  assert.ok(Object.keys(sound.ADVANCED_EQ_PRESETS).length >= 3);
  for (const bands of Object.values(sound.ADVANCED_EQ_PRESETS)) {
    assert.equal(bands.length, 5);
    assert.ok(bands.every((value) => Number.isInteger(value) && value >= -12 && value <= 12));
  }
});
