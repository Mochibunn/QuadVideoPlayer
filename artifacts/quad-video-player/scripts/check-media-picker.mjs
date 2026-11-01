import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../lib/media-picker.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function setup({ choices = [], native = true, platform = 'android', failSamsung = false } = {}) {
  const calls = [];
  const selected = { canceled: false, assets: [{ uri: 'content://video/1', name: 'clip.mkv' }] };
  const tools = {
    async pickFiles(samsung) {
      calls.push(samsung ? 'samsung' : 'other');
      if (samsung && failSamsung) throw new Error('My Files unavailable');
      return selected;
    },
    async getVideoPreview(uri) { calls.push(uri); return `file://${uri}.jpg`; },
  };
  const exports = {};
  const modules = {
    expo: { requireOptionalNativeModule: () => native ? tools : null },
    'expo-document-picker': {
      async getDocumentAsync(options) {
        calls.push('system');
        assert.equal(options.type, '*/*');
        assert.equal(options.multiple, true);
        assert.equal(options.copyToCacheDirectory, false);
        return selected;
      },
    },
    'react-native': {
      Platform: { OS: platform },
      Alert: {
        alert(_title, _message, buttons, options) {
          const choice = choices.shift();
          if (choice == null) options.onDismiss();
          else {
            const button = buttons.find((item) => item.text === choice);
            assert.ok(button, `Missing option ${choice}`);
            button.onPress();
          }
        },
      },
    },
  };
  vm.runInNewContext(outputText, {
    exports,
    require: (name) => {
      assert.ok(modules[name], `Unexpected import ${name}`);
      return modules[name];
    },
  });
  return { api: exports, calls, tools };
}

test('Samsung option launches My Files and returns original content URI', async () => {
  const { api, calls } = setup({ choices: ['Samsung My Files'] });
  const result = await api.pickMediaFiles();
  assert.equal(result.assets[0].uri, 'content://video/1');
  assert.deepEqual(calls, ['samsung']);
});
test('another-app option launches the Android app chooser', async () => {
  const { api, calls } = setup({ choices: ['Choose another app'] });
  await api.pickMediaFiles();
  assert.deepEqual(calls, ['other']);
});
test('system picker remains available without MIME-based hiding or copies', async () => {
  const { api, calls } = setup({ choices: ['System picker'] });
  await api.pickMediaFiles();
  assert.deepEqual(calls, ['system']);
});
test('dismissing the selection menu does not launch an activity', async () => {
  const { api, calls } = setup();
  assert.equal((await api.pickMediaFiles()).canceled, true);
  assert.deepEqual(calls, []);
});
test('unavailable Samsung app offers another app instead', async () => {
  const { api, calls } = setup({ choices: ['Samsung My Files', 'Choose another app'], failSamsung: true });
  await api.pickMediaFiles();
  assert.deepEqual(calls, ['samsung', 'other']);
});
test('unavailable Samsung app offers the system picker', async () => {
  const { api, calls } = setup({ choices: ['Samsung My Files', 'System picker'], failSamsung: true });
  await api.pickMediaFiles();
  assert.deepEqual(calls, ['samsung', 'system']);
});
test('canceling unavailable-app recovery preserves the current selection', async () => {
  const { api, calls } = setup({ choices: ['Samsung My Files', 'Cancel'], failSamsung: true });
  assert.equal((await api.pickMediaFiles()).canceled, true);
  assert.deepEqual(calls, ['samsung']);
});
for (const options of [{ native: false }, { platform: 'ios' }]) {
  test(`system fallback works with ${JSON.stringify(options)}`, async () => {
    const { api, calls } = setup(options);
    await api.pickMediaFiles();
    assert.deepEqual(calls, ['system']);
  });
}
test('thumbnail queue skips unmounted rows and survives a failed extraction', async () => {
  const { api, calls, tools } = setup();
  const missing = api.getVideoPreview('unmounted', () => false);
  const original = tools.getVideoPreview;
  tools.getVideoPreview = async (uri) => {
    if (uri === 'bad') throw new Error('Unsupported codec');
    return original(uri);
  };
  const failed = api.getVideoPreview('bad', () => true);
  const good = api.getVideoPreview('good', () => true);
  assert.equal(await missing, null);
  await assert.rejects(failed, /Unsupported codec/);
  assert.equal(await good, 'file://good.jpg');
  assert.deepEqual(calls, ['good']);
});
test('thumbnail requests never overlap', async () => {
  const { api, tools } = setup();
  let active = 0;
  let peak = 0;
  tools.getVideoPreview = async (uri) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return uri;
  };
  await Promise.all(['one', 'two', 'three'].map((uri) => api.getVideoPreview(uri, () => true)));
  assert.equal(peak, 1);
});
