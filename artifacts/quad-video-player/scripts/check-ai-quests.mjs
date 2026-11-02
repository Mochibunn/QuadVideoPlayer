import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function loadTs(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const rpg = await loadTs('../lib/player-rpg.ts');
const localStory = await loadTs('../lib/local-story.ts');
const controls = await loadTs('../lib/input-controls.ts');
const now = new Date(2026, 10, 2, 12).getTime();

test('local story preferences default safely and reject non-app model paths', () => {
  const empty = localStory.parseLocalStoryPreferences(null);
  assert.match(empty.systemPrompt, /Pawstar/);
  const parsed = localStory.parseLocalStoryPreferences(JSON.stringify({
    modelUri: 'content://untrusted/model.gguf',
    modelName: 'ignored.gguf',
    systemPrompt: '  Be a cheerful guild familiar.  ',
    enemyBanterEnabled: true,
  }));
  assert.equal(parsed.modelUri, null);
  assert.equal(parsed.modelName, '');
  assert.equal(parsed.systemPrompt, '  Be a cheerful guild familiar.  ');
  assert.equal(parsed.enemyBanterEnabled, true);
});

test('AI quest JSON is bounded and stays tied to a game-owned objective', () => {
  const narrative = localStory.parseStoryQuestNarrative(JSON.stringify({
    title: 'The Pixel Moon Hunt',
    description: 'Drive four moon sprites from the guild den.',
    enemyLine: 'My pixels have been defeated!',
  }));
  assert.equal(narrative.title, 'The Pixel Moon Hunt');
  assert.equal(localStory.parseStoryQuestNarrative('not json'), null);
  assert.match(localStory.storyQuestPrompt(
    { id: 'defeats', label: 'Defeat 4 enemies' },
    { className: 'Moonfang Warden', companionName: 'Pawstar' },
  ), /exact measurable objective/);
});

test('story quests track combat, persist, and pay only the fixed reward', () => {
  let state = rpg.emptyPlayerRpgState(now);
  const quest = rpg.createStoryQuest(
    'story-pixel-quest-01',
    'defeats',
    'The Pixel Moon Hunt',
    'Drive four moon sprites from the guild den.',
    now,
  );
  assert.ok(quest);
  state = rpg.addRpgStoryQuest(state, quest);
  assert.equal(rpg.getRpgQuests(state, now).at(-1).target, 4);
  state = rpg.recordRpgCombat(state, { defeats: 3 }, now);
  assert.equal(state.storyQuests[0].progress, 3);
  assert.equal(rpg.canClaimRpgQuest(state, quest.id, now), false);
  state = rpg.recordRpgCombat(state, { defeats: 1 }, now);
  assert.equal(rpg.canClaimRpgQuest(state, quest.id, now), true);
  state = rpg.claimRpgQuest(state, quest.id, now);
  assert.equal(state.storyQuests[0].claimed, true);
  assert.equal(state.coins, 28);
  const restored = rpg.parsePlayerRpg(JSON.stringify(state), now);
  assert.equal(restored.storyQuests[0].title, 'The Pixel Moon Hunt');
  assert.equal(restored.storyQuests[0].claimed, true);
});

test('story quest import ignores forged objectives, rewards, and impossible progress', () => {
  const oldState = rpg.emptyPlayerRpgState(now);
  const migrated = rpg.parsePlayerRpg(JSON.stringify({ ...oldState, version: 2 }), now);
  assert.deepEqual(migrated.storyQuests, []);
  const parsed = rpg.parsePlayerRpg(JSON.stringify({
    ...oldState,
    storyQuests: [{
      id: 'story-imported-01',
      objective: 'defeats',
      title: 'Imported quest',
      description: 'A safe imported story.',
      target: 999,
      rewardCoins: 999999,
      progress: 999,
      claimed: false,
      createdAt: now,
    }],
  }), now);
  assert.equal(parsed.storyQuests[0].target, 4);
  assert.equal(parsed.storyQuests[0].rewardCoins, 20);
  assert.equal(parsed.storyQuests[0].progress, 4);
});

test('S Pen mode accepts stylus combat taps but ignores finger taps', () => {
  assert.equal(controls.shouldActivateCombatTap('touch', 'touch'), true);
  assert.equal(controls.shouldActivateCombatTap('spen', 'touch'), false);
  assert.equal(controls.shouldActivateCombatTap('spen', 'pen'), true);
});
