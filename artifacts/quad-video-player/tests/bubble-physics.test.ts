// @ts-nocheck -- node:test runner file; run with a TS-aware node loader.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSlideshow } from '../lib/slideshow.ts';
import { stepBubbles } from '../lib/bubble-physics.ts';

const body = (id, x, vx, y = 10, vy = 0) => ({
  id, x, y, width: 20, height: 20, minX: 0, maxX: 120, minY: 0, maxY: 80, vx, vy,
});
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y;

test('bubbles exchange velocity and separate after a head-on collision', () => {
  const [left, right] = stepBubbles([body('left', 30, 20), body('right', 51, -20)], 0.05);
  assert.ok(!overlaps(left, right));
  assert.ok(left.vx < 0);
  assert.ok(right.vx > 0);
});

test('bubbles reflect off all screen edges without leaving their bounds', () => {
  const [edge] = stepBubbles([body('edge', 1, -40, 1, -30)], 0.05);
  assert.equal(edge.x, 0);
  assert.equal(edge.y, 0);
  assert.ok(edge.vx > 0);
  assert.ok(edge.vy > 0);
});

test('a compact group of bubbles separates and stays apart as it moves', () => {
  let crowd = Array.from({ length: 8 }, (_, index) => ({
    ...body(`bubble-${index}`, 135, (index % 2 ? -1 : 1) * (25 + index), 135, (index % 3 ? 1 : -1) * 17),
    width: 45, height: 45, maxX: 300, maxY: 300,
  }));
  for (let frame = 0; frame < 180; frame++) crowd = stepBubbles(crowd, 1 / 60);
  for (let a = 0; a < crowd.length; a++) for (let b = a + 1; b < crowd.length; b++) {
    assert.ok(!overlaps(crowd[a], crowd[b]), `${crowd[a].id} overlaps ${crowd[b].id}`);
  }
  for (const item of crowd) {
    assert.ok(item.x >= 0 && item.x + item.width <= 300);
    assert.ok(item.y >= 0 && item.y + item.height <= 300);
  }
});

test('legacy slideshow settings load collision mode disabled; new setting persists', () => {
  assert.equal(parseSlideshow({ enabled: true, pool: [], instances: [] }).avoidOverlap, false);
  assert.equal(parseSlideshow({ enabled: true, avoidOverlap: true, pool: [], instances: [] }).avoidOverlap, true);
});
