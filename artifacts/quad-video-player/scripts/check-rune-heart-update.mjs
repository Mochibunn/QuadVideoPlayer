import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function load(name) {
  const text = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(text, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const chat = await load('pawstar-chat');
const controls = await load('stream-controls');
// Match the existing reward-test loader for its border helper dependencies.
const rewardsSource = await readFile(new URL('../lib/player-rewards.ts', import.meta.url), 'utf8');
const geometrySource = await readFile(new URL('../lib/border-geometry.ts', import.meta.url), 'utf8');
const compile = (text) => ts.transpileModule(text, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const uri = (text) => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const geometry = uri(compile(geometrySource));
const rewardCode = compile(rewardsSource).replace(/from ['"]\.\/border-geometry['"]/g, `from '${geometry}'`);
const rewards = await import(uri(rewardCode));

test('solo audio unmutes the chosen stream and restores individual mute choices when released', () => {
  const original = [false, true, false, true];
  assert.deepEqual(original.map((mute, slot) => controls.streamAudioMuted(mute, slot, 1)), [true, false, true, true]);
  assert.deepEqual(original.map((mute, slot) => controls.streamAudioMuted(mute, slot, null)), original);
});
test('video headers meet the toolbar exactly, including borders and focused bottom slots', () => {
  for (let slot = 0; slot < 4; slot++) {
    for (const border of [0, 8, 30, 100]) {
      assert.equal(controls.streamHeaderTop(slot, slot, 90, border), Math.max(0, 90 - border));
    }
  }
  assert.equal(controls.streamHeaderTop(0, null, 90, 12), 78);
  assert.equal(controls.streamHeaderTop(2, null, 90, 12), 0);
});
test('previous video uses slot history and skips files removed from the pool', () => {
  const history = [{ id: 'first' }, { id: 'second' }, { id: 'removed' }];
  assert.deepEqual(controls.popPreviousVideo(history, [{ id: 'first' }, { id: 'second' }]), { id: 'second' });
  assert.deepEqual(controls.popPreviousVideo(history, [{ id: 'first' }]), { id: 'first' });
  assert.equal(controls.popPreviousVideo(history, []), undefined);
});
test('verbose replies retain paragraphs and are no longer capped at 400 characters', () => {
  const text = ['First paragraph. '.repeat(50), 'Second paragraph. '.repeat(50)].join('\n\n');
  const result = chat.parseChatReply(text);
  assert.ok(result.length > 1_000);
  assert.ok(result.includes('\n\n'));
  assert.doesNotMatch(chat.CHAT_GUARDRAIL, /under 50 words/);
});
test('long automatic conversations retain the last actual user topic', () => {
  let history = [{ role: 'user', content: 'Describe the moon guild and its library.' }];
  for (let i = 0; i < 90; i++) history = chat.appendChat(history, { role: 'assistant', content: `Reply ${i}` });
  assert.equal(history.length, 40);
  assert.equal(history[0].role, 'user');
  assert.match(chat.autoChatPrompt(history, 'Pawstar'), /moon guild/);
  const input = chat.chatContext([...history, { role: 'user', content: chat.autoChatPrompt(history, 'Pawstar') }]);
  assert.equal(input.at(-1).role, 'user');
  assert.match(input.at(-1).content, /moon guild/);
});
test('generated cheers append visibly without replacing user writing or repeating notes', () => {
  const original = 'My own first note.\nMy own second note.';
  const result = rewards.appendGeneratedCheerText(original, ['New cheer!', 'MY OWN FIRST NOTE.', 'New   cheer!', 'Fresh note.']);
  assert.equal(result.text, `${original}\nNew cheer!\nFresh note.`);
  assert.deepEqual(result.added, ['New cheer!', 'Fresh note.']);
});
test('cheer deck includes more than eight notes and shows every line before repeating', () => {
  const lines = Array.from({ length: 32 }, (_, i) => `Cheer ${i}`);
  assert.equal(rewards.messagesForCongratText(lines.join('\n')).length, 32);
  const shuffled = lines.map((_, minute) => rewards.celebrationLineForMinute(lines, minute));
  assert.deepEqual([...shuffled].sort(), [...lines].sort());
  assert.equal(new Set(shuffled).size, 32);
  assert.notEqual(shuffled.at(-1), rewards.celebrationLineForMinute(lines, 32));
});
test('large cheer text survives preferences round-trip, capped at 128 unique lines', () => {
  const text = Array.from({ length: 100 }, (_, i) => `A new guild cheer ${i}!`).join('\n');
  assert.equal(rewards.parsePlayerRewards(JSON.stringify({ congratsText: text })).congratsText, text);
  const full = rewards.appendGeneratedCheerText(text, Array.from({ length: 100 }, (_, i) => `Extra cheer ${i}!`));
  assert.equal(full.added.length, 28);
  assert.equal(rewards.messagesForCongratText(full.text).length, 128);
});
