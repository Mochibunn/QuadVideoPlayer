// @ts-nocheck -- node:test runner file; run with a TS-aware node loader.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bubblePlacement, directedWaypoint, type MotionBounds } from '../lib/enemy-motion';
import {
  canRequestPlan, mergeHuntImages, nextHuntTag, resolvePlan, COMBAT_REQUEST_GAP_MS, TAG_HUNT_GAP_MS,
} from '../lib/combat-director';

const bounds: MotionBounds = { minX: 0, maxX: 1000, minY: 0, maxY: 600 };
const fixed = () => 0.5;
const gate = { enabled: true, modelLoaded: true, storytellerBusy: false, paused: false, runActive: true, hasLiving: true };

test('dash heads to the normalized focus faster than drift', () => {
  const from = { x: 0, y: 0 };
  const dash = directedWaypoint(from, bounds, false, { pattern: 'dash', speed: 1, x: 0.8, y: 0.5 }, 0, fixed);
  assert.equal(dash.x, 800); assert.equal(dash.y, 300);
  const drift = directedWaypoint(from, bounds, false, { pattern: 'drift', speed: 1, x: 0.8, y: 0.5 }, 0, fixed);
  assert.ok(drift.x < dash.x);
  assert.ok(dash.duration / Math.hypot(dash.x, dash.y) < drift.duration / Math.hypot(drift.x, drift.y));
});

test('orbit circles the focus and speed multiplier shortens travel', () => {
  const d = { pattern: 'orbit' as const, speed: 1, x: 0.5, y: 0.5 };
  const a = directedWaypoint({ x: 500, y: 300 }, bounds, false, d, 0, fixed);
  const b = directedWaypoint({ x: 500, y: 300 }, bounds, false, d, 1, fixed);
  assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
  assert.ok(Math.abs(Math.hypot(a.x - 500, a.y - 300) - 168) < 1);
  const fast = directedWaypoint({ x: 500, y: 300 }, bounds, false, { ...d, speed: 1.6 }, 0, fixed);
  assert.ok(fast.duration < a.duration);
});

test('calm mode caps speed and keeps targets in bounds', () => {
  const w = directedWaypoint({ x: 0, y: 0 }, bounds, true, { pattern: 'dash', speed: 1.6, x: 1, y: 1 }, 3, fixed);
  assert.ok(w.duration >= 1600 && w.hold >= 400 && Math.abs(w.rotate) <= 4.8);
  assert.ok(w.x <= 1000 && w.y <= 600);
});

test('bubble placement clamps into the viewport', () => {
  const p = bubblePlacement({ x: -40, y: 2 }, 100, { width: 200, height: 60 }, { width: 400, height: 300 });
  assert.equal(p.left, 8); assert.equal(p.below, true); assert.ok(p.top + 60 <= 292);
});

test('request budget: one in flight, 20s after completion, skips busy/paused', () => {
  assert.equal(canRequestPlan({ inFlight: false, lastCompletedAt: null }, gate, 0), true);
  assert.equal(canRequestPlan({ inFlight: true, lastCompletedAt: null }, gate, 0), false);
  assert.equal(canRequestPlan({ inFlight: false, lastCompletedAt: 1000 }, gate, 1000 + COMBAT_REQUEST_GAP_MS - 1), false);
  assert.equal(canRequestPlan({ inFlight: false, lastCompletedAt: 1000 }, gate, 1000 + COMBAT_REQUEST_GAP_MS), true);
  assert.equal(canRequestPlan({ inFlight: false, lastCompletedAt: null }, { ...gate, storytellerBusy: true }, 0), false);
  assert.equal(canRequestPlan({ inFlight: false, lastCompletedAt: null }, { ...gate, paused: true }, 0), false);
});

const plan = {
  actors: [
    { id: 'a', motion: { pattern: 'dash' as const, speed: 1, x: 0.2, y: 0.2 }, taunt: 'Come here', defeatLine: 'Blast it' },
    { id: 'b', motion: { pattern: 'orbit' as const, speed: 1, x: 0.5, y: 0.5 }, taunt: 'Ha', defeatLine: 'Ugh' },
    { id: 'x', motion: { pattern: 'orbit' as const, speed: 1, x: 0.5, y: 0.5 }, taunt: 'Ghost', defeatLine: 'Ghost' },
  ],
  tags: ['slime'],
};
const ticket = { runId: 1, hardEpoch: 2, softEpoch: 3, actorIds: ['a', 'b'] };

test('stale plans are rejected and dead actors never move', () => {
  const live = { runId: 1, hardEpoch: 2, softEpoch: 3, living: new Set(['a']), defeatedAt: new Map([['b', 900]]), now: 1000 };
  assert.equal(resolvePlan(plan, ticket, { ...live, runId: 2 }), null);
  assert.equal(resolvePlan(plan, ticket, { ...live, hardEpoch: 3 }), null);
  const r = resolvePlan(plan, ticket, live)!;
  assert.deepEqual(Object.keys(r.motions), ['a']);
  assert.deepEqual(r.lateDefeats, [{ enemyId: 'b', text: 'Ugh' }]);
  assert.equal(r.defeatLines.x, undefined);
  assert.deepEqual(r.tags, ['slime']);
  const soft = resolvePlan(plan, ticket, { ...live, softEpoch: 4 })!;
  assert.deepEqual(soft.motions, {}); assert.deepEqual(soft.tags, []); assert.equal(soft.lateDefeats.length, 1);
  const old = resolvePlan(plan, ticket, { ...live, now: 7000 })!;
  assert.equal(old.lateDefeats.length, 0);
});

test('tag hunt budget and pool merge', () => {
  assert.equal(nextHuntTag(['a'], { accepted: [], lastHuntAt: null, inFlight: false }, 0), 'a');
  assert.equal(nextHuntTag(['a', 'b'], { accepted: ['a'], lastHuntAt: 0, inFlight: false }, TAG_HUNT_GAP_MS - 1), null);
  assert.equal(nextHuntTag(['a', 'b'], { accepted: ['a'], lastHuntAt: 0, inFlight: false }, TAG_HUNT_GAP_MS), 'b');
  assert.equal(nextHuntTag(['d'], { accepted: ['a', 'b', 'c'], lastHuntAt: null, inFlight: false }, 0), null);
  const merged = mergeHuntImages([{ uri: '1' }], [{ uri: '1' }, { uri: '2' }, { uri: 'v', kind: 'video' }, { uri: 'k' }, { uri: '3' }], new Set(['k']), 2);
  assert.deepEqual(merged.map((m) => m.uri), ['1', '2']);
});

import { combineEnemyPool, directorHardKey, resetHuntBudget } from '../lib/combat-director';

test('hard key changes when the source filters change', () => {
  const src = { id: 's', kind: 'rule34', tags: 'cat', excludeTags: '', safeOnly: true };
  const key = directorHardKey(true, true, src);
  assert.equal(key, directorHardKey(true, true, { ...src }));
  assert.notEqual(key, directorHardKey(true, true, { ...src, tags: 'dog' }));
  assert.notEqual(key, directorHardKey(true, true, { ...src, excludeTags: 'x' }));
  assert.notEqual(key, directorHardKey(true, true, { ...src, safeOnly: false }));
  assert.notEqual(key, directorHardKey(true, true, { ...src, kind: 'e621' }));
  assert.notEqual(key, directorHardKey(false, true, src));
  assert.notEqual(key, directorHardKey(true, false, src));
});

test('hunt budget survives source change but not a new run', () => {
  const b = { accepted: ['a', 'b'], lastHuntAt: 5, inFlight: true };
  assert.deepEqual(resetHuntBudget(b, 'source'), { accepted: ['a', 'b'], lastHuntAt: 5, inFlight: false });
  assert.deepEqual(resetHuntBudget(b, 'run'), { accepted: [], lastHuntAt: null, inFlight: false });
  assert.equal(nextHuntTag(['c', 'd'], resetHuntBudget({ accepted: ['a', 'b', 'c'], lastHuntAt: null, inFlight: false }, 'source'), 0), null);
});

test('combined pool is capped, dedupes uri/preview and reserves AI slots', () => {
  const base = Array.from({ length: 100 }, (_, i) => ({ uri: `b${i}`, preview: `p${i}` }));
  const extras = [{ uri: 'b1' }, { uri: 'x', preview: 'p2' }, ...Array.from({ length: 30 }, (_, i) => ({ uri: `e${i}` }))];
  const pool = combineEnemyPool(base, extras, 80, 24);
  assert.equal(pool.length, 80);
  assert.equal(pool.filter((i) => i.uri.startsWith('e')).length, 24);
  assert.ok(!pool.some((i) => i.uri === 'x'));
  assert.equal(new Set(pool.map((i) => i.uri)).size, 80);
  const small = combineEnemyPool(base.slice(0, 10), extras.slice(2), 80, 24);
  assert.equal(small.length, 40);
  assert.equal(combineEnemyPool(base, [], 80, 24).length, 80);
});
