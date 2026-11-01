import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/sound-settings.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { DEFAULT_SOUND, EQ_PRESETS, parseSoundSettings } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
test('first launch uses bit-exact original audio with all effects off', () => {
  assert.deepEqual(parseSoundSettings(null), DEFAULT_SOUND);
  assert.equal(DEFAULT_SOUND.eq, false);
  assert.equal(DEFAULT_SOUND.reverb, 'off');
  assert.equal(DEFAULT_SOUND.reverbMix, 22);
  assert.equal(DEFAULT_SOUND.reverbDecay, 0.68);
  assert.equal(DEFAULT_SOUND.preDelayMs, 0);
  assert.equal(DEFAULT_SOUND.echo, false);
});
test('all reverb presets and EQ gains round-trip through storage', () => {
  for (const reverb of ['off', 'room', 'chamber', 'hall', 'cathedral', 'plate', 'spring']) {
    const value = { eq: true, bands: [-12, -6, 0, 6, 12], reverb, reverbMix: 64,
      reverbDecay: 0.72, preDelayMs: 35, echo: true };
    assert.deepEqual(parseSoundSettings(JSON.stringify(value)), value);
  }
});
test('stored band values are bounded, rounded, and sanitized', () => {
  assert.deepEqual(parseSoundSettings('{"bands":[-100,100,1.8,"bad",null]}').bands, [-12, 12, 2, 0, 0]);
  const settings = parseSoundSettings('{"reverbMix":101,"reverbDecay":2,"preDelayMs":240}');
  assert.equal(settings.reverbMix, 100);
  assert.equal(settings.reverbDecay, 0.95);
  assert.equal(settings.preDelayMs, 120);
});
test('unknown reverb and incorrect toggle types cannot enable effects', () => {
  assert.deepEqual(parseSoundSettings('{"reverb":"unknown","eq":"true","echo":1}'), DEFAULT_SOUND);
});
test('missing bands and null data restore safe defaults', () => {
  assert.deepEqual(parseSoundSettings('null'), DEFAULT_SOUND);
  assert.deepEqual(parseSoundSettings('{}').bands, [0, 0, 0, 0, 0]);
});
test('malformed storage is reported rather than silently accepted', () => {
  assert.throws(() => parseSoundSettings('{'));
});
test('presets contain five valid gains, with a true flat reset', () => {
  assert.deepEqual(EQ_PRESETS.Flat, [0, 0, 0, 0, 0]);
  for (const bands of Object.values(EQ_PRESETS)) {
    assert.equal(bands.length, 5);
    assert.ok(bands.every((value) => Number.isInteger(value) && value >= -12 && value <= 12));
  }
});
