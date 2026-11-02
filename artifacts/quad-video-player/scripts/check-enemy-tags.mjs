import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';

const path = new URL('../lib/enemy-tag-suggestions.ts', import.meta.url);
const compiled = ts.transpile(fs.readFileSync(path, 'utf8'), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
});
const module = { exports: {} };
new Function('module', 'exports', compiled)(module, module.exports);
const { parseEnemyTagSuggestions, filterEnemyTagSuggestions, separateEnemyQuery, enemyTagPrompt } = module.exports;
const request = {
  provider: 'e621', existingTags: 'fox -rain', excludeTags: 'watermark young*',
  safeOnly: true, theme: 'Moonlit forest spirits',
};

test('AI output cannot remove rating filters or inject query operators', () => {
  assert.deepEqual(parseEnemyTagSuggestions(JSON.stringify({
    tags: ['wolf', 'rating:explicit', '-rating:safe', 'order:random', 'https://example.org', 'blue sky'],
  }), request), ['wolf', 'blue_sky']);
});

test('duplicates, current tags, negative tags and wildcard blacklists are rejected', () => {
  assert.deepEqual(filterEnemyTagSuggestions(
    ['FOX', 'wolf', 'Wolf', 'rain', 'watermark', 'young_wolf', 'dragon'], request,
  ), ['wolf', 'dragon']);
});

test('malformed or excessive model output is bounded', () => {
  assert.deepEqual(parseEnemyTagSuggestions('bad json', request), []);
  assert.deepEqual(parseEnemyTagSuggestions('{"tags":"wolf"}', request), []);
  assert.equal(filterEnemyTagSuggestions(Array.from({ length: 50 }, (_, i) => `tag_${i}`), request).length, 8);
  assert.deepEqual(filterEnemyTagSuggestions(['x'.repeat(65), '', {}, 'forest'], request), ['forest']);
});

test('separate searches retain negative tags embedded in the original query', () => {
  assert.equal(separateEnemyQuery('wolf', 'fox -rain,-young* -rain'), 'wolf -rain -young*');
  assert.equal(separateEnemyQuery('dragon', 'fox landscape'), 'dragon');
});

test('prompt includes saved filters as data and asks for reviewed non-graphic suggestions', () => {
  const prompt = enemyTagPrompt(request);
  assert.match(prompt, /non-graphic/);
  assert.match(prompt, /reviewed/);
  assert.match(prompt, /Safe-rated search: yes/);
  assert.match(prompt, /young\*/);
  assert.match(prompt, /Moonlit forest spirits/);
});
