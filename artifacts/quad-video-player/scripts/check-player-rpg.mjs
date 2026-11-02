import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/player-rpg.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const rpg = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function localNoon(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12, 0, 0).getTime();
}

function shiftDays(timestamp, amount) {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + amount);
  return date.getTime();
}

function playMinutes(state, minutes, now) {
  for (let minute = 0; minute < minutes; minute += 1) {
    state = rpg.addRpgPlaybackTime(state, 60_000, now);
  }
  return state;
}

test('RPG progress starts locally with daily and weekly quests', () => {
  const now = localNoon(2026, 10, 2);
  const state = rpg.emptyPlayerRpgState(now);
  assert.equal(state.coins, 0);
  assert.equal(state.petName, 'Pawstar');
  assert.equal(rpg.getRpgQuests(state, now).length, 6);
  assert.equal(rpg.getRpgQuests(state, now)[0].progress, 0);
});

test('classes, quests, and mature cosmetics use the furry fantasy Goon Quest theme', () => {
  const now = localNoon(2026, 10, 2);
  const state = rpg.emptyPlayerRpgState(now);
  assert.deepEqual(rpg.goonQuestClasses.map(({ name }) => name), [
    'Moonfang Warden',
    'Foxfire Enchanter',
    'Wildpaw Stalker',
    'Slytail Trickster',
  ]);
  assert.equal(rpg.goonQuestClasses.find(({ id }) => id === 'rogue').spell, 'Goonstorm');
  const defaultQuests = rpg.getRpgQuests(state, now);
  assert.match(defaultQuests.find(({ id }) => id === 'daily-focus').title, /Gooning/);
  assert.match(defaultQuests.find(({ id }) => id === 'daily-hunter').title, /Bouncing beast/);
  assert.doesNotMatch(defaultQuests.find(({ id }) => id === 'daily-focus').description, /Masturbate/);
  const adultQuests = rpg.getRpgQuests(rpg.setAdultRewardFlavor(state, true), now);
  assert.match(adultQuests.find(({ id }) => id === 'daily-focus').description, /Masturbate/);
  assert.match(adultQuests.find(({ id }) => id === 'daily-arcana').description, /edging/);
  assert.match(adultQuests.find(({ id }) => id === 'daily-dungeon').description, /before you come/);
  assert.equal(
    rpg.rpgShopItems.find(({ id }) => id === 'after-dark-charm').name,
    'Gooner’s Velvet Collar',
  );
});

test('play time advances the companion and qualifies a daily streak once', () => {
  const dayOne = localNoon(2026, 10, 2);
  let state = rpg.emptyPlayerRpgState(dayOne);
  state = playMinutes(state, 10, dayOne);
  assert.equal(rpg.currentRpgStreak(state, dayOne), 1);
  assert.equal(state.bestStreak, 1);
  assert.equal(state.activeDayKeys.length, 1);
  state = rpg.addRpgPlaybackTime(state, 60_000, dayOne);
  assert.equal(state.currentStreak, 1);
  assert.equal(state.petXp, 11);
  const dayTwo = shiftDays(dayOne, 1);
  state = rpg.advancePlayerRpgDate(state, dayTwo);
  assert.equal(state.todayPlaybackMs, 0);
  state = playMinutes(state, 10, dayTwo);
  assert.equal(rpg.currentRpgStreak(state, dayTwo), 2);
  assert.equal(state.bestStreak, 2);
  const dayThree = shiftDays(dayOne, 2);
  state = playMinutes(rpg.advancePlayerRpgDate(state, dayThree), 10, dayThree);
  assert.equal(state.coins, 30);
  assert.deepEqual(state.claimedStreakRewardDays, [3]);
  state = playMinutes(state, 10, dayThree);
  assert.equal(state.coins, 30);
});

test('daily video quest deduplicates IDs and quest rewards cannot be claimed twice', () => {
  const now = localNoon(2026, 10, 2);
  let state = rpg.emptyPlayerRpgState(now);
  state = playMinutes(state, 15, now);
  state = rpg.recordRpgVideos(state, ['a', 'b', 'a', 'c', 'd'], now);
  const quests = rpg.getRpgQuests(state, now);
  assert.equal(quests[0].progress, 15);
  assert.equal(quests[1].progress, 4);
  assert.equal(rpg.canClaimRpgQuest(state, 'daily-focus', now), true);
  state = rpg.claimRpgQuest(state, 'daily-focus', now);
  assert.equal(state.coins, 25);
  state = rpg.claimRpgQuest(state, 'daily-focus', now);
  assert.equal(state.coins, 25);
  state = rpg.claimRpgQuest(state, 'daily-explorer', now);
  assert.equal(state.coins, 45);
});

test('weekly cadence counts four qualifying local days and resets by week', () => {
  const monday = localNoon(2026, 10, 2);
  let state = rpg.emptyPlayerRpgState(monday);
  for (let day = 0; day < 4; day += 1) {
    const now = shiftDays(monday, day);
    state = playMinutes(rpg.advancePlayerRpgDate(state, now), 10, now);
  }
  assert.equal(rpg.weeklyActiveDayCount(state, shiftDays(monday, 3)), 4);
  assert.equal(rpg.canClaimRpgQuest(state, 'weekly-cadence', shiftDays(monday, 3)), true);
  state = rpg.claimRpgQuest(state, 'weekly-cadence', shiftDays(monday, 3));
  assert.equal(state.coins, 100);
  const nextWeek = shiftDays(monday, 7);
  state = rpg.advancePlayerRpgDate(state, nextWeek);
  assert.equal(state.weeklyQuestClaimed, false);
});

test('level-ups grant skill points and skills affect quest rewards, pet XP, and shop prices', () => {
  const now = localNoon(2026, 10, 2);
  let state = rpg.emptyPlayerRpgState(now);
  state = rpg.awardRpgSkillPoints(state, 4);
  assert.equal(state.skillPoints, 3);
  state = rpg.upgradeRpgSkill(state, 'fortune');
  assert.equal(state.skills.fortune, 1);
  assert.equal(state.skillPoints, 2);
  state = rpg.upgradeRpgSkill(state, 'bond');
  assert.equal(state.skills.bond, 1);
  state = rpg.addRpgPlaybackTime(state, 60_000, now);
  assert.equal(state.petXp, 1);
  assert.equal(state.petXpRemainderMs, 15_000);
  state = rpg.awardRpgSkillPoints(state, 3);
  state = rpg.upgradeRpgSkill(state, 'bargain');
  const item = rpg.rpgShopItems.find((entry) => entry.id === 'moon-charm');
  assert.equal(rpg.shopItemCost(state, item), 62);
});

test('adult cosmetic flavor is opt-in and disabling it unequips mature items', () => {
  const now = localNoon(2026, 10, 2);
  let state = rpg.emptyPlayerRpgState(now);
  const matureItem = rpg.rpgShopItems.find((item) => item.matureOnly);
  state = { ...state, coins: 200 };
  assert.equal(rpg.purchaseRpgItem(state, matureItem.id).ownedItemIds.length, 0);
  state = rpg.setAdultRewardFlavor(state, true);
  state = rpg.purchaseRpgItem(state, matureItem.id);
  assert.equal(state.equippedItemId, matureItem.id);
  state = rpg.setAdultRewardFlavor(state, false);
  assert.equal(state.equippedItemId, null);
  assert.equal(state.ownedItemIds.includes(matureItem.id), true);
});

test('saved RPG data is sanitized, rolls daily state, and rejects damaged JSON', () => {
  const now = localNoon(2026, 10, 2);
  const raw = JSON.stringify({
    ...rpg.emptyPlayerRpgState(now),
    coins: -4,
    skills: { fortune: 99, bond: 1, bargain: 1 },
    petName: '   ',
    ownedItemIds: ['unknown', 'pixel-crown'],
    todayPlaybackMs: 90_000,
  });
  const parsed = rpg.parsePlayerRpg(raw, now);
  assert.equal(parsed.coins, 0);
  assert.equal(parsed.skills.fortune, rpg.SKILL_RANK_LIMIT);
  assert.equal(parsed.petName, 'Pawstar');
  assert.deepEqual(parsed.ownedItemIds, ['pixel-crown']);
  const nextDay = rpg.parsePlayerRpg(JSON.stringify(parsed), shiftDays(now, 1));
  assert.equal(nextDay.todayPlaybackMs, 0);
  assert.throws(() => rpg.parsePlayerRpg('{'));
});

test('version one saves migrate into Goon Quest combat defaults', () => {
  const now = localNoon(2026, 10, 2);
  const legacy = rpg.emptyPlayerRpgState(now);
  delete legacy.classId;
  delete legacy.totalDefeated;
  delete legacy.defeatedToday;
  delete legacy.spellsToday;
  delete legacy.dungeonsToday;
  legacy.version = 1;
  const migrated = rpg.parsePlayerRpg(JSON.stringify(legacy), now);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.classId, 'guardian');
  assert.equal(migrated.totalDefeated, 0);
  assert.equal(migrated.dungeonsToday, 0);
});

test('combat records targets, casts, dungeon clears, and class selection', () => {
  const now = localNoon(2026, 10, 2);
  let state = rpg.emptyPlayerRpgState(now);
  state = rpg.recordRpgCombat(state, { defeats: 3, spells: 2, dungeons: 1 }, now);
  assert.equal(state.totalDefeated, 3);
  assert.equal(state.defeatedToday, 3);
  assert.equal(state.spellsToday, 2);
  assert.equal(state.dungeonsToday, 1);
  assert.equal(state.coins, 26);
  state = rpg.setGoonQuestClass(state, 'arcanist');
  assert.equal(state.classId, 'arcanist');
  assert.equal(rpg.getRpgQuests(state, now).find((quest) => quest.id === 'daily-hunter').progress, 3);
});
