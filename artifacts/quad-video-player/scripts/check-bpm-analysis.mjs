import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../lib/beat-analysis.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, Math, Number });
const { estimateBpm } = exports;
const bossSource = await readFile(new URL('../lib/boss-fight.ts', import.meta.url), 'utf8');
const bossCompiled = ts.transpileModule(bossSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const bossExports = {};
vm.runInNewContext(bossCompiled, { exports: bossExports, Math, Number });

function pulseEnvelope(bpm, seconds = 24, sampleRate = 50) {
  const period = 60 * sampleRate / bpm;
  return Array.from({ length: seconds * sampleRate }, (_, i) => {
    const phase = i % period;
    return phase < 2 ? 0.9 - phase * 0.2 : 0.04;
  });
}

test('detects steady BPM from synthetic energy pulses', () => {
  for (const expected of [72, 90, 120, 146]) {
    const estimate = estimateBpm(pulseEnvelope(expected));
    assert.ok(estimate.bpm !== null, `expected a BPM for ${expected}`);
    const octaveAmbiguous = Math.abs(estimate.bpm - expected * 2) <= 3 ||
      Math.abs(estimate.bpm * 2 - expected) <= 3;
    assert.ok(Math.abs(estimate.bpm - expected) <= 3 || octaveAmbiguous,
      `${expected} BPM estimated as ${estimate.bpm}`);
    assert.ok(estimate.confidence > 0.5);
  }
});

test('does not invent a tempo for silence or clips that are too short', () => {
  assert.equal(estimateBpm(new Array(1200).fill(0)).bpm, null);
  assert.equal(estimateBpm(pulseEnvelope(120, 4)).bpm, null);
});

test('boss health scales with playable video time and rejects unfairly short windows', () => {
  assert.equal(bossExports.bossHealthForRemainingSeconds(60), 390);
  assert.equal(bossExports.bossHealthForRemainingSeconds(120), 780);
  assert.equal(bossExports.bossHealthForRemainingSeconds(14), 0);
  assert.equal(bossExports.bossHealthForRemainingSeconds(Number.NaN), 0);
});
