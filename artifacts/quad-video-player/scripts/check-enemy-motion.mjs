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

const motion = await loadTs('../lib/enemy-motion.ts');
function seeded(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 2 ** 32; };
}

test('enemy size is large on tablets and clamped on small screens', () => {
  assert.ok(motion.enemySizeFor(2560, 1600, 2) >= 300);
  assert.equal(motion.enemySizeFor(300, 300, 4), 132);
  assert.equal(motion.enemySizeFor(5000, 5000, 1), 360);
  assert.ok(motion.enemySizeFor(1600, 1000, 4) < motion.enemySizeFor(1600, 1000, 2));
});

test('bounds keep whole sprite on the field, even when it is tiny', () => {
  const b = motion.boundsFor(1000, 800, 200, 130);
  assert.deepEqual(b, { minX: 10, maxX: 790, minY: 10, maxY: 460 });
  const tiny = motion.boundsFor(100, 100, 200, 130);
  assert.ok(tiny.maxX >= tiny.minX && tiny.maxY >= tiny.minY);
  assert.deepEqual(motion.clampToBounds({ x: -50, y: 9999 }, b), { x: 10, y: 460 });
});

test('waypoints stay bounded, vary, and calm mode is slower and gentler', () => {
  const b = motion.boundsFor(1600, 1000, 300, 130);
  const rand = seeded(42);
  let from = { x: b.minX, y: b.minY };
  const durations = new Set(); const rotations = new Set(); const curves = new Set();
  for (let i = 0; i < 300; i += 1) {
    const w = motion.nextWaypoint(from, b, false, rand);
    assert.ok(w.x >= b.minX && w.x <= b.maxX && w.y >= b.minY && w.y <= b.maxY);
    assert.ok(Math.abs(w.rotate) <= 11 && w.duration >= 380 && w.duration <= 5200 && w.hold >= 0);
    durations.add(w.duration); rotations.add(w.rotate); curves.add(w.curve);
    from = w;
  }
  assert.ok(durations.size > 50 && rotations.size > 50 && curves.size === 4);
  const calmRand = seeded(7);
  for (let i = 0; i < 200; i += 1) {
    const w = motion.nextWaypoint(from, b, true, calmRand);
    assert.ok(Math.abs(w.rotate) <= 4 && w.duration >= 1600);
    from = w;
  }
});

test('waypoints are deterministic for a seed and spawns spread across columns', () => {
  const b = motion.boundsFor(1600, 1000, 300, 130);
  assert.deepEqual(motion.nextWaypoint({ x: 0, y: 0 }, b, false, seeded(3)), motion.nextWaypoint({ x: 0, y: 0 }, b, false, seeded(3)));
  const rand = seeded(9);
  const xs = [0, 1, 2, 3].map((i) => motion.spawnPoint(b, i, 4, rand).x);
  for (let i = 1; i < xs.length; i += 1) assert.ok(xs[i] > xs[i - 1]);
});
