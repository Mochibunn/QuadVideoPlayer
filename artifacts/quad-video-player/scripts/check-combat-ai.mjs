import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(new URL('../package.json', import.meta.url));
async function load(name, modules = {}) {
  const source = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
  } });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    require(name) { assert.ok(name in modules, `Unexpected import ${name}`); return modules[name]; },
  });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const tags = await load('lib/enemy-tag-suggestions.ts');
const ai = await load('lib/combat-ai.ts', { './enemy-tag-suggestions': tags });
const preferences = await load('lib/local-story.ts');
const core = await load('lib/online-sources.ts', {
  'fast-xml-parser': require('fast-xml-parser'), htmlparser2: require('htmlparser2'),
});
const request = {
  enemies: [{ id: 'enemy-1', name: 'Fox knight', hp: 2, maxHp: 3 }],
  wave: 2, bpm: 120, allowTags: true, allowProfanity: true,
  tagContext: { provider: 'e621', existingTags: 'fox -rain', excludeTags: 'young* watermark', safeOnly: true, theme: '' },
};
const actor = {
  id: 'enemy-1', pattern: 'orbit', speed: 1, x: 0.25, y: 0.8,
  taunt: 'Catch me, damn it!', defeatLine: 'Well, shit. You win.',
};

test('AI actions use supplied enemy IDs, known patterns, and bounded coordinates/speed', () => {
  const parsed = ai.parseCombatAiPlan(JSON.stringify({
    actors: [{ ...actor, speed: 999, x: -15, y: 1e9 }, actor, { ...actor, id: 'forged' }],
    tags: [],
  }), request);
  assert.equal(parsed.actors.length, 1);
  assert.deepEqual(plain(parsed.actors[0].motion), { pattern: 'orbit', speed: 1.6, x: 0, y: 1 });
  assert.equal(ai.parseCombatAiPlan('{"actors":[{"id":"enemy-1","pattern":"execute_code"}],"tags":[]}', request), null);
});

test('dialogue accepts profanity while remaining short plain text', () => {
  const parsed = ai.parseCombatAiPlan(JSON.stringify({
    actors: [{ ...actor, taunt: `\u0000${'x'.repeat(500)}` }], tags: [],
  }), request);
  assert.equal(parsed.actors[0].taunt.length, 120);
  assert.equal(parsed.actors[0].defeatLine, 'Well, shit. You win.');
  assert.equal(ai.parseCombatAiPlan('not JSON', request), null);
});

test('automatic tags cannot override ratings, blacklist or opt-out', () => {
  const text = JSON.stringify({ actors: [actor], tags: ['rating:explicit', 'young_wolf', 'rain', 'wolf', 'dragon', 'forest'] });
  assert.deepEqual(plain(ai.parseCombatAiPlan(text, request).tags), ['wolf', 'dragon']);
  assert.deepEqual(plain(ai.parseCombatAiPlan(text, { ...request, allowTags: false }).tags), []);
  assert.deepEqual(plain(ai.parseCombatAiPlan(text, { ...request, tagContext: null }).tags), []);
  assert.match(ai.combatAiPrompt(request), /Swearing is welcome/);
  assert.match(ai.combatAiPrompt({ ...request, allowProfanity: false }), /free of profanity/);
});

test('older storyteller settings migrate without enabling autonomous network access', () => {
  const old = preferences.parseLocalStoryPreferences('{"enemyBanterEnabled":true,"systemPrompt":"Be a fox."}');
  assert.equal(old.enemyBanterEnabled, true);
  assert.equal(old.combatAiEnabled, false);
  assert.equal(old.combatAutoTagsEnabled, false);
  assert.equal(old.combatSpeechEnabled, true);
  assert.equal(old.combatProfanityEnabled, true);
  const restored = preferences.parseLocalStoryPreferences(JSON.stringify({
    ...old, combatAiEnabled: true, combatAutoTagsEnabled: true, combatProfanityEnabled: false,
  }));
  assert.equal(restored.combatAiEnabled, true);
  assert.equal(restored.combatAutoTagsEnabled, true);
  assert.equal(restored.combatProfanityEnabled, false);
});

const base = {
  id: 'enemies', name: 'Forest', kind: 'e621', board: '', tags: 'fox -rain',
  excludeTags: 'watermark young*', safeOnly: true, subreddits: '', sort: 'hot', dungeonEnemy: true,
};
async function providerHarness(fetchPage) {
  const hooks = [];
  let cursor = 0;
  let saved = JSON.stringify([base]);
  const calls = [];
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useState(initial) {
      const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
      return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
    },
    useEffect() {}, useCallback: callback => callback,
  };
  const provider = await load('hooks/useOnlineSources.tsx', {
    react: { ...react, __esModule: true, default: react },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@react-native-async-storage/async-storage': {
      async getItem() { return saved; }, async setItem(_key, value) { saved = value; },
    },
    '@/lib/reddit-account': { redditGet() { assert.fail('Unexpected Reddit request'); } },
    '@/lib/rule34-account': { async readRule34Credentials() { return null; } },
    '@/lib/enemy-tag-suggestions': tags,
    '@/lib/online-sources': { ...core, fetchSourcePage: (...args) => {
      calls.push(args);
      return fetchPage(...args);
    } },
  });
  function render() { cursor = 0; return provider.OnlineSourcesProvider({ children: null }).props.value; }
  await render().retryStorage();
  return { render, calls, saved: () => JSON.parse(saved) };
}
const image = { id: 'image', kind: 'image', uri: 'https://example.org/image.png', name: 'Wolf', postUrl: 'https://example.org/post' };
test('automatic searches retain filters, do not edit saved searches, and return images only', async () => {
  const h = await providerHarness(async () => ({ items: [image, { ...image, id: 'video', kind: 'video' }] }));
  const api = h.render();
  const result = await api.fetchEnemyTagImages('enemies', 'wolf', new AbortController().signal);
  assert.equal(result.length, 1);
  const transient = h.calls[0][0];
  assert.equal(transient.tags, 'wolf -rain');
  assert.equal(transient.excludeTags, base.excludeTags);
  assert.equal(transient.safeOnly, true);
  assert.equal(h.saved()[0].tags, 'fox -rain');
  await assert.rejects(api.fetchEnemyTagImages('enemies', 'dragon', new AbortController().signal), /one per minute/);
  assert.equal(h.calls.length, 1);
});

test('excluded, invalid and already present tags never initiate a request', async () => {
  const h = await providerHarness(async () => { assert.fail('Forbidden tag reached network'); });
  for (const tag of ['young_wolf', 'rain', 'watermark', 'fox', 'rating:explicit']) {
    await assert.rejects(h.render().fetchEnemyTagImages('enemies', tag, new AbortController().signal), /excluded, or invalid/);
  }
  assert.equal(h.calls.length, 0);
});

test('cancelled and late deleted-source results cannot enter the enemy pool', async () => {
  let resolve;
  const h = await providerHarness(() => new Promise(done => { resolve = done; }));
  const controller = new AbortController();
  const request = h.render().fetchEnemyTagImages('enemies', 'wolf', controller.signal);
  await h.render().removeSource('enemies');
  resolve({ items: [image] });
  await assert.rejects(request, /changed or was removed/);
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(h.render().fetchEnemyTagImages('enemies', 'wolf', stopped.signal), /cancelled/);
});
