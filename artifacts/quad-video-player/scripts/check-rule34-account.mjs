import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../lib/rule34-account.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
});
const storage = new Map();
const secureStore = {
  async getItemAsync(key) { return storage.get(key) ?? null; },
  async setItemAsync(key, value) { storage.set(key, value); },
  async deleteItemAsync(key) { storage.delete(key); },
};
const account = {};
vm.runInNewContext(outputText, { exports: account, require(name) {
  assert.equal(name, 'expo-secure-store');
  return { ...secureStore, __esModule: true };
} });

test('Rule34 API key is stored and read through SecureStore', async () => {
  await account.saveRule34Credentials({ userId: '123456', apiKey: 'test-api-key' });
  assert.deepEqual({ ...await account.readRule34Credentials() }, { userId: '123456', apiKey: 'test-api-key' });
  assert.deepEqual({ ...await account.rule34AccountSummary() }, { userId: '123456' });
  assert.equal(JSON.parse(storage.values().next().value).userId, '123456');
});

test('Rule34 credentials reject malformed user IDs and empty or oversized keys', async () => {
  await assert.rejects(account.saveRule34Credentials({ userId: 'not-numeric', apiKey: 'key' }), /numeric user ID/);
  await assert.rejects(account.saveRule34Credentials({ userId: '123', apiKey: '' }), /valid Rule34 API key/);
  await assert.rejects(account.saveRule34Credentials({ userId: '123', apiKey: 'k'.repeat(257) }), /valid Rule34 API key/);
});

test('malformed secure data fails explicitly and disconnect removes it', async () => {
  const key = storage.keys().next().value;
  storage.set(key, '{');
  await assert.rejects(account.readRule34Credentials(), /saved Rule34 API credentials are invalid/);
  await account.saveRule34Credentials({ userId: '123', apiKey: 'valid-key' });
  await account.removeRule34Credentials();
  assert.equal(await account.readRule34Credentials(), null);
});
