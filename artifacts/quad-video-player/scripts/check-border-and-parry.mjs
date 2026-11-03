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

const geo = await loadTs('../lib/border-geometry.ts');
const rewards = await loadTs('../lib/player-rewards.ts');
const parry = await loadTs('../lib/paw-parry.ts');
const flavor = await loadTs('../lib/quest-flavor.ts');

test('quad layout has 4 outer strips + one shared centre line per axis at full (not doubled) thickness', () => {
  const strips = geo.borderStrips(1280, 800, 22, 'quad');
  assert.equal(strips.length, 6);
  const v = strips.find((s) => s.id === 'center-v');
  const h = strips.find((s) => s.id === 'center-h');
  assert.equal(v.width, 22); assert.equal(v.x, 629); assert.equal(v.height, 800);
  assert.equal(h.height, 22); assert.equal(h.y, 389); assert.equal(h.width, 1280);
  const left = strips.find((s) => s.id === 'left');
  assert.deepEqual([left.x, left.y, left.width, left.height], [0, 0, 22, 800]);
  assert.equal(geo.borderStrips(1280, 800, 22, 'single').length, 4);
  assert.deepEqual(geo.borderStrips(0, 800, 22, 'quad'), []);
});

test('tile grid covers every strip at min/max scale for all scroll phases and directions', () => {
  for (const layout of ['quad', 'single']) {
    for (const [w, hgt] of [[1280, 800], [2560, 1600], [411, 913], [1001, 677]]) {
      for (const scale of [0.5, 1, 1.7, 2.5, 6]) {
        const tile = 160 * scale;
        for (const dir of rewards.BORDER_DIRECTIONS) {
          const loop = geo.scrollLoop(rewards.borderDirectionVector(dir), tile, 3);
          for (const strip of geo.borderStrips(w, hgt, 22, layout)) {
            const grid = geo.tileGridForStrip(strip, tile);
            for (let p = 0; p <= 1.0001; p += 0.125) {
              assert.ok(geo.gridCoversStrip(grid, strip, loop.dx * p, loop.dy * p),
                `${layout} ${w}x${hgt} s${scale} ${dir} ${strip.id} p${p}`);
            }
            // Pattern anchored to the global grid: strip origin + grid origin is a tile multiple.
            const gx = (strip.x + grid.originX) / tile;
            const gy = (strip.y + grid.originY) / tile;
            assert.ok(Math.abs(gx - Math.round(gx)) < 1e-6 && Math.abs(gy - Math.round(gy)) < 1e-6);
          }
        }
      }
    }
  }
});

test('direction parsing is backward compatible and diagonals are normalized with equal speed', () => {
  assert.equal(rewards.parseBorderDirection('left'), 'left');
  assert.equal(rewards.parseBorderDirection('NE'), 'up-right');
  assert.equal(rewards.parseBorderDirection('southwest'), 'down-left');
  assert.equal(rewards.parseBorderDirection('sideways'), 'right');
  assert.equal(rewards.parseBorderDirection(42, 'up'), 'up');
  const d = rewards.borderDirectionVector('down-right');
  assert.ok(Math.abs(Math.hypot(d.x, d.y) - 1) < 1e-9);
  const card = geo.scrollLoop(rewards.borderDirectionVector('right'), 160, 4);
  const diag = geo.scrollLoop(rewards.borderDirectionVector('up-left'), 160, 4);
  assert.deepEqual([diag.dx, diag.dy], [-160, -160]);
  assert.ok(Math.abs(card.pxPerSecond - diag.pxPerSecond) / card.pxPerSecond < 0.01);
  const legacy = rewards.parsePlayerRewards(JSON.stringify({ scrollDirection: 'up', textureScale: 9, borderStyle: 'pawprint' }));
  assert.equal(legacy.scrollDirection, 'up');
  assert.equal(legacy.textureScale, 6);
  assert.equal(legacy.borderStyle, 'pawprint');
  assert.equal(rewards.parsePlayerRewards(JSON.stringify({ textureScale: 0.1 })).textureScale, 0.5);
  assert.equal(rewards.isTexturedBorder('pawprint'), true);
  assert.equal(rewards.isTexturedBorder('prism'), false);
});

const play = (events, state = parry.initialParryState) => events.reduce(parry.parryReducer, state);

test('start baselines the pre-game gesture and GO needs one fresh swing', () => {
  let s = play([{ type: 'start', mode: 'watch', now: 0, gestureId: 'g7' }]);
  s = play([{ type: 'swing', now: 10, gestureId: 'g7', source: 'watch' }, { type: 'tick', now: parry.GRACE_MS }], s);
  assert.equal(s.phase, 'cue'); assert.equal(s.cue, 'go');
  s = play([{ type: 'swing', now: 2000, gestureId: 'g8', source: 'watch' }], s);
  assert.equal(s.outcome, 'hit'); assert.equal(s.score, 1); assert.equal(s.combo, 1);
  s = play([{ type: 'swing', now: 2050, gestureId: 'g9', source: 'watch' }], s);
  assert.equal(s.score, 1, 'second swing in same cue is ignored');
  s = play([{ type: 'swing', now: 2060, gestureId: 'g9', source: 'watch' }], s);
  assert.equal(s.lastGestureId, 'g9');
});

test('GO timeout misses, HOLD rewards stillness and punishes a swing, lives end the run', () => {
  let s = play([{ type: 'start', mode: 'touch', now: 0, gestureId: null }, { type: 'tick', now: parry.GRACE_MS }]);
  s = play([{ type: 'tick', now: parry.GRACE_MS + parry.GO_WINDOW_MS }], s);
  assert.equal(s.lives, 2); assert.equal(s.phase, 'rest');
  // Watch swings are ignored in touch mode (never pretend motion).
  s = play([{ type: 'tick', now: 10_000 }, { type: 'swing', now: 10_001, gestureId: 'x', source: 'watch' }], s);
  assert.equal(s.resolved, false);
  // Find a hold round deterministically.
  const holdRound = Array.from({ length: 40 }, (_, i) => i).find((i) => parry.cueForRound(i) === 'hold');
  assert.ok(holdRound >= 2);
  let h = { ...parry.initialParryState, mode: 'touch', phase: 'rest', round: holdRound, phaseEndsAt: 0, lives: 3 };
  h = play([{ type: 'tick', now: 0 }, { type: 'tick', now: parry.HOLD_WINDOW_MS }], h);
  assert.equal(h.score, 1); assert.equal(h.combo, 1);
  let f = { ...parry.initialParryState, mode: 'touch', phase: 'rest', round: holdRound, phaseEndsAt: 0, lives: 1 };
  f = play([{ type: 'tick', now: 0 }, { type: 'swing', now: 5, gestureId: null, source: 'touch' }, { type: 'tick', now: parry.HOLD_WINDOW_MS }], f);
  assert.equal(f.phase, 'over'); assert.equal(f.lives, 0);
});

test('stale sensor auto-pauses, fresh return re-baselines with grace, user pause is manual', () => {
  let s = play([{ type: 'start', mode: 'watch', now: 0, gestureId: 'a' }, { type: 'tick', now: parry.GRACE_MS }]);
  s = play([{ type: 'sensor', now: 2000, ok: false, gestureId: null }], s);
  assert.equal(s.phase, 'paused'); assert.equal(s.pauseReason, 'sensor');
  s = play([{ type: 'swing', now: 2100, gestureId: 'b', source: 'watch' }, { type: 'tick', now: 9000 }], s);
  assert.equal(s.phase, 'paused'); assert.equal(s.score, 0);
  s = play([{ type: 'sensor', now: 9100, ok: true, gestureId: 'c' }], s);
  assert.equal(s.phase, 'rest'); assert.equal(s.lastGestureId, 'c'); assert.equal(s.phaseEndsAt, 9100 + parry.GRACE_MS);
  s = play([{ type: 'swing', now: 9150, gestureId: 'c', source: 'watch' }], s);
  assert.equal(s.score, 0);
  s = play([{ type: 'pause', now: 9200 }, { type: 'sensor', now: 9300, ok: true, gestureId: 'd' }], s);
  assert.equal(s.phase, 'paused'); assert.equal(s.pauseReason, 'user');
  assert.equal(parry.isMotionFresh({ connected: true, available: true, receivedAtMs: 1000 }, 3000), true);
  assert.equal(parry.isMotionFresh({ connected: true, available: true, receivedAtMs: 1000 }, 4000), false);
  assert.equal(parry.isMotionFresh({ connected: false, available: true, receivedAtMs: 1000 }, 1000), false);
  assert.deepEqual(parry.parseParryBests('{"watch":12.7,"touch":-3}'), { watch: 12, touch: 0 });
  assert.deepEqual(parry.parseParryBests('nope'), { watch: 0, touch: 0 });
});

test('flavor copy rotates deterministically and ranks climb', () => {
  assert.equal(flavor.pickLine(['a', 'b', 'c'], 4), 'b');
  assert.equal(flavor.rankForParryScore(0).title, 'Kitten Cadet');
  assert.equal(flavor.rankForParryScore(45).paws, 4);
  assert.match(flavor.familiarCheer('Pip', 0), /^Pip /);
});
