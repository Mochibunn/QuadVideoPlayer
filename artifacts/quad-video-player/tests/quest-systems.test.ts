// @ts-nocheck -- node:test runner file; run with a TS-aware node loader.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyEnemyHit, clampEnemyCount, planWaves } from '../lib/combat-waves.ts';
import { batchSummary, clampBatchCount, openStoryQuestSlots, runQuestBatch } from '../lib/quest-batch.ts';
import {
  bossAbility, bossDefend, bossDifficulty, bossStrike, createBossState, isWeakOpen, stepBoss,
} from '../lib/boss-mechanics.ts';
import {
  addGeneratedHonor, bumpLedgerCounter, claimGuildHonor, emptyGuildLedger, evaluateGuildHonors,
  parseGuildLedger, prunePins, togglePin, MAX_PINS,
} from '../lib/guild-ledger.ts';
import { appendChat, chatContext, MAX_CHAT_HISTORY } from '../lib/pawstar-chat.ts';
import { parseCelebrations, parseHonorIdea } from '../lib/local-story.ts';

const rpg = (over = {}) => ({
  totalDefeated: 0, bestStreak: 0, currentStreak: 0, awardedLevel: 1, petXp: 0, ownedItemIds: [], ...over,
});

test('enemy count selects the actual simultaneous crowd in each of three waves', () => {
  assert.equal(clampEnemyCount(0), 1);
  assert.equal(clampEnemyCount(99), 12);
  assert.deepEqual(planWaves(1), [1, 1, 1]);
  assert.deepEqual(planWaves(5), [5, 5, 5]);
  assert.deepEqual(planWaves(12), [12, 12, 12]);
  for (let n = 1; n <= 12; n += 1) {
    const plan = planWaves(n);
    assert.equal(plan.reduce((a, b) => a + b, 0), n * 3);
    assert.ok(plan.length === 3 && plan.every((c) => c === n));
  }
});

test('a second hit on a defeated enemy is ignored (no double damage)', () => {
  const first = applyEnemyHit([{ id: 'a', hp: 1 }], 'a', 1);
  assert.equal(first.defeated.id, 'a');
  assert.equal(applyEnemyHit(first.next, 'a', 1), null);
});

test('quest batch is sequential, keeps finished quests on failure and cancel', async () => {
  assert.equal(openStoryQuestSlots([{ claimed: false }, { claimed: true }]), 9);
  assert.equal(clampBatchCount(9, 2), 2);
  assert.equal(clampBatchCount(3, 0), 0);
  let inFlight = 0; let maxInFlight = 0; let calls = 0;
  const generate = async () => {
    inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); calls += 1;
    await new Promise((r) => setTimeout(r, 1));
    inFlight -= 1;
    return calls === 3 ? null : { n: calls };
  };
  const result = await runQuestBatch({ count: 5, generate, add: () => true, isCancelled: () => false });
  assert.equal(maxInFlight, 1);
  assert.equal(result.added.length, 2);
  assert.equal(result.stop, 'model');
  let cancel = false;
  const cancelled = await runQuestBatch({
    count: 4, generate: async () => ({}), add: () => { cancel = true; return true; }, isCancelled: () => cancel,
  });
  assert.equal(cancelled.added.length, 1);
  assert.equal(cancelled.stop, 'cancelled');
  const full = await runQuestBatch({ count: 3, generate: async () => ({}), add: () => false, isCancelled: () => false });
  assert.equal(full.stop, 'full');
  assert.match(batchSummary(1, 3, 'cancelled'), /kept/);
});

test('boss clock never moves without step calls and difficulty scales with clip length', () => {
  assert.ok(bossDifficulty(20) < bossDifficulty(240));
  assert.ok(bossDifficulty(9999) <= 1.35 && bossDifficulty(0) >= 0.8);
  const boss = createBossState({ maxHp: 300, remainingSeconds: 60, bpm: null });
  assert.equal(boss.clockMs, 0);
  assert.equal(stepBoss(boss, 0), boss);
});

test('weak points multiply damage and telegraphs require the right defense', () => {
  let boss = createBossState({ maxHp: 1000, remainingSeconds: 120, bpm: 120 });
  const normal = bossStrike(boss).damage;
  while (!isWeakOpen(boss)) boss = stepBoss(boss, 50, () => 0.9);
  assert.ok(bossStrike(boss).damage >= normal * 3);
  let t = createBossState({ maxHp: 1000, remainingSeconds: 120, bpm: null });
  while (!t.attack) t = stepBoss(t, 100, () => 0.1);
  assert.equal(t.attack.kind, 'sweep');
  const good = bossDefend(t, 'dodge');
  assert.equal(good.counters, 1);
  assert.ok(bossStrike(good).damage > 8);
  const bad = bossDefend(t, 'guard');
  assert.ok(bad.focus < t.focus);
  assert.equal(bad.combo, 0);
});

test('boss abilities respect play-clock cooldowns and phases advance', () => {
  let boss = createBossState({ maxHp: 90, remainingSeconds: 30, bpm: null });
  const first = bossAbility(boss, 'spell', 3, 'Spell');
  assert.ok(first.damage > 0);
  assert.equal(bossAbility(first.state, 'spell', 3, 'Spell').damage, 0);
  boss = first.state;
  for (let i = 0; i < 60 && boss.hp > 0; i += 1) boss = bossStrike({ ...boss, stunnedUntil: 0 }).state;
  assert.equal(boss.phase, 3);
});

test('guild ledger parses old/garbage saves and tracks honors with claim conditions', () => {
  assert.deepEqual(parseGuildLedger('nope').claimedHonorIds, []);
  let ledger = emptyGuildLedger();
  const before = evaluateGuildHonors(rpg(), ledger).find((h) => h.id === 'honor-first-boss');
  assert.equal(before.complete, false);
  assert.equal(claimGuildHonor(ledger, rpg(), 'honor-first-boss'), ledger);
  ledger = bumpLedgerCounter(ledger, 'bossVictories');
  ledger = claimGuildHonor(ledger, rpg(), 'honor-first-boss');
  assert.ok(ledger.claimedHonorIds.includes('honor-first-boss'));
  const round = parseGuildLedger(JSON.stringify(ledger));
  assert.equal(round.counters.bossVictories, 1);
});

test('generated honors count from their baseline, pins are bounded and pruned', () => {
  const state = rpg({ totalDefeated: 40 });
  const ledger = addGeneratedHonor(emptyGuildLedger(), state, { title: 'Moon Hunter', description: 'Keeps going.' }, 'g1');
  const honor = evaluateGuildHonors(state, ledger).find((h) => h.id === 'g1');
  assert.equal(honor.progress, 0);
  assert.equal(honor.metric, 'totalDefeated');
  const later = evaluateGuildHonors(rpg({ totalDefeated: 75 }), ledger).find((h) => h.id === 'g1');
  assert.equal(later.complete, true);
  let pins = emptyGuildLedger();
  for (let i = 0; i < 10; i += 1) pins = togglePin(pins, 'quest', `q${i}`);
  assert.equal(pins.pinnedQuestIds.length, MAX_PINS);
  assert.deepEqual(prunePins(pins, ['q1'], []).pinnedQuestIds, ['q1']);
  assert.equal(parseGuildLedger(JSON.stringify(ledger)).generatedHonors[0].baseline, 40);
});

test('chat history is bounded and model context starts with a user turn', () => {
  let history = [];
  for (let i = 0; i < 60; i += 1) history = appendChat(history, { role: i % 2 ? 'assistant' : 'user', content: `m${i}` });
  assert.equal(history.length, MAX_CHAT_HISTORY);
  const context = chatContext(history, 5);
  assert.equal(context[0].role, 'user');
  assert.ok(context.length <= 5);
  assert.equal(appendChat([], { role: 'user', content: '   ' }).length, 0);
});

test('celebration and honor parsers reject empty output', () => {
  assert.deepEqual(parseCelebrations('{"lines":["Well done","Well done","Onward, hero"]}'), ['Well done', 'Onward, hero']);
  assert.deepEqual(parseCelebrations(''), []);
  assert.equal(parseHonorIdea('no json'), null);
  assert.deepEqual(parseHonorIdea('{"title":"Dusk Ward","description":"Holds the line."}'), { title: 'Dusk Ward', description: 'Holds the line.' });
});
