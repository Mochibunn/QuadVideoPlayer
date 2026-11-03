// @ts-nocheck -- node:test runner file; run with a TS-aware node loader.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { borderStrips } from '../lib/border-geometry.ts';
import {
  celebrationLineForMinute, celebrationLinesFrom, clampBorderThickness, clampTextureScale, effectiveBorderThickness,
  mergeGeneratedCheers, nextCheerMinute, parsePlayerRewards,
} from '../lib/player-rewards.ts';
import {
  applyPositionPreset, DEFAULT_SESSION_STATS, heartSummary, overlayOrigin, parseSessionStatsSettings,
} from '../lib/session-stats-overlay.ts';

test('old saves migrate: thickness null, scale kept, new max 6', () => {
  const s = parsePlayerRewards(JSON.stringify({ borderStyle: 'puzzled', textureScale: 2.5 }));
  assert.equal(s.borderThickness, null);
  assert.equal(s.textureScale, 2.5);
  assert.equal(clampTextureScale(9), 6);
  assert.equal(effectiveBorderThickness('puzzled', null), 22);
  assert.equal(effectiveBorderThickness('gamecubed', null), 5);
  assert.equal(clampBorderThickness(200), 64);
  assert.equal(parsePlayerRewards(JSON.stringify({ borderThickness: 1 })).borderThickness, 4);
  assert.equal(parsePlayerRewards(JSON.stringify({ borderStyle: 'trans-flag' })).borderStyle, 'trans-flag');
});

test('strips honour thickness without gaps', () => {
  for (const t of [4, 22, 64]) {
    const q = borderStrips(800, 600, t, 'quad');
    assert.equal(q.length, 6);
    assert.equal(q.find((s) => s.id === 'top').height, t);
    const c = q.find((s) => s.id === 'center-v');
    assert.equal(c.width, t); assert.equal(c.x + t / 2, 400);
    assert.equal(q.find((s) => s.id === 'right').x + t, 800);
    assert.equal(borderStrips(800, 600, t, 'single').length, 4);
  }
  assert.equal(borderStrips(40, 30, 64, 'single')[0].height, 15);
});

test('minute cheers never replay and only fire while playing', () => {
  assert.equal(nextCheerMinute(null, 600_000, true), null);
  assert.equal(nextCheerMinute(5, 300_000, true), null);
  assert.equal(nextCheerMinute(5, 361_000, true), 6);
  assert.equal(nextCheerMinute(5, 361_000, false), null);
  const lines = celebrationLinesFrom(['a', ' ', 'b'], 'x');
  assert.deepEqual(lines, ['a', 'b']);
  assert.equal(celebrationLineForMinute(lines, 3), 'b');
  assert.deepEqual(celebrationLinesFrom(undefined, 'one\ntwo'), ['one', 'two']);
});

test('stats overlay settings parse and errors', () => {
  assert.deepEqual(parseSessionStatsSettings(null), DEFAULT_SESSION_STATS);
  assert.throws(() => parseSessionStatsSettings('{bad'));
  assert.throws(() => parseSessionStatsSettings('[]'));
  const s = parseSessionStatsSettings(JSON.stringify({ x: 140, fontSize: 2, color: 'nope', enabled: true }));
  assert.equal(s.x, 100); assert.equal(s.fontSize, 11); assert.equal(s.color, 'theme'); assert.equal(s.enabled, true);
  assert.equal(applyPositionPreset(s, 'bottom-right').y, 96);
  assert.deepEqual(overlayOrigin(1000, 500, 200, 100, 100, 0), { left: 800, top: 0 });
});

test('heart summary never invents data', () => {
  assert.equal(heartSummary(undefined).text, '—');
  assert.equal(heartSummary({ min: 0, max: 0, sum: 0, count: 0 }).text, '—');
  assert.equal(heartSummary({ min: 60, max: 120, sum: 270, count: 3 }).text, '60 / 90 / 120 bpm');
});

test('generated cheers exclude echoed seeds, deduplicate and keep older variations', () => {
  assert.deepEqual(mergeGeneratedCheers('Original note', [' Original note ', 'Fresh', 'fresh', ' '], ['Older', 'Fresh']),
    ['Fresh', 'Older']);
  assert.equal(mergeGeneratedCheers('Seed', Array.from({ length: 40 }, (_, i) => `Note ${i}`)).length, 32);
  assert.deepEqual(mergeGeneratedCheers('Seed', ['seed']), []);
});
