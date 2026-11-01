import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

// Exercise the same pure TypeScript logic imported by the native screen,
// without requiring a React Native runtime or adding another test framework.
const source = await readFile(new URL('../lib/audio-mode.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { getVideoAudioMode } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('Normalize OFF bypasses normalization and linking regardless of Sync', () => {
  assert.equal(getVideoAudioMode(false, false), 'independent');
  assert.equal(getVideoAudioMode(false, true), 'independent');
});

test('Normalize ON and Sync ON share slider levels without loudness processing', () => {
  assert.equal(getVideoAudioMode(true, true), 'shared');
});

test('Normalize ON and Sync OFF enable true loudness processing', () => {
  assert.equal(getVideoAudioMode(true, false), 'normalized');
});
