import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function load(path, modules) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, require: (name) => {
      assert.ok(name in modules, `Unexpected import: ${name}`);
      return modules[name];
    },
  });
  return exports;
}
const sound = await load('../lib/sound-settings.ts', {});
const codec = await load('../lib/sessions.ts', { './sound-settings': sound });
const plain = (value) => JSON.parse(JSON.stringify(value));
const media = (name) => ({ id: `content://files/${name}`, uri: `content://files/${name}`, name });
function fixture() {
  const pool = ['a.mp4', 'b.mkv', 'c.mov', 'd.webm', 'extra.mp4'].map(media);
  return {
    version: 1, savedAt: '2026-11-01T13:00:00.000Z', pool,
    streams: pool.slice(0, 4).map((asset, i) => ({
      asset, position: 23.4 + i, volume: i * 0.2, muted: i === 1, playing: i !== 2,
    })),
    audio: [{ ...media('rain.wav'), position: 71.2, volume: 0.3, muted: true, paused: true }],
    globalPlaying: true, sourceLabel: 'Downloads',
    settings: { themeId: 'amethyst', normalize: true, sync: false, fill: true,
      controlsDelay: 0, sharedVolume: 0.4, sound: { eq: true, bands: [-4, 0, 3, 0, 5], echo: true, reverb: 'hall' } },
  };
}
test('complete session round-trips all independent states and sound settings', () => {
  assert.deepEqual(plain(codec.parseSession(JSON.stringify(fixture()))), fixture());
});
test('pool includes unused selections and preserves four quadrant order', () => {
  const value = codec.parseSession(JSON.stringify(fixture()));
  assert.equal(value.pool.length, 5);
  assert.deepEqual(plain(value.streams.map((s) => s.asset.name)), ['a.mp4', 'b.mkv', 'c.mov', 'd.webm']);
  assert.equal(value.streams[2].playing, false);
  assert.equal(value.streams[1].muted, true);
});
test('one clip can validly occupy multiple independent quadrants', () => {
  const value = fixture();
  value.pool = [value.pool[0]];
  value.streams.forEach((s) => { s.asset = value.pool[0]; });
  assert.equal(codec.parseSession(JSON.stringify(value)).streams.length, 4);
});
test('audio-only and stopped video-pool sessions round-trip', () => {
  for (const onlyAudio of [true, false]) {
    const value = fixture();
    value.streams = [];
    if (onlyAudio) value.pool = [];
    assert.deepEqual(plain(codec.parseSession(JSON.stringify(value))), value);
  }
});
test('removed videos are not reintroduced by the session codec', () => {
  const value = fixture();
  value.pool.pop();
  assert.equal(codec.parseSession(JSON.stringify(value)).pool.length, 4);
});
for (const [label, edit] of [
  ['future version', (s) => { s.version = 9; }],
  ['partial quadrant list', (s) => { s.streams.pop(); }],
  ['orphan stream', (s) => { s.streams[0].asset = media('missing.mp4'); }],
  ['duplicate pool URI', (s) => { s.pool.push(s.pool[0]); }],
  ['duplicate audio URI', (s) => { s.audio.push(s.audio[0]); }],
  ['invalid position', (s) => { s.streams[0].position = null; }],
  ['invalid paused flag', (s) => { s.audio[0].paused = 'false'; }],
  ['remote media URL', (s) => { s.audio[0].uri = 'https://example.com/audio.mp3'; }],
  ['invalid date', (s) => { s.savedAt = 'invalid'; }],
]) {
  test(`corrupt ${label} is rejected before any restore`, () => {
    const value = fixture(); edit(value);
    assert.throws(() => codec.parseSession(JSON.stringify(value)));
  });
}
test('bounded settings and seek targets are sanitized', () => {
  const value = fixture();
  value.streams[0].position = -20;
  value.streams[0].volume = 5;
  value.settings.controlsDelay = 55;
  const parsed = codec.parseSession(JSON.stringify(value));
  assert.equal(parsed.streams[0].position, 0);
  assert.equal(parsed.streams[0].volume, 1);
  assert.equal(parsed.settings.controlsDelay, 30);
  assert.equal(codec.seekPosition(999, 100), 99.95);
  assert.equal(codec.seekPosition(45, 0), 45);
});
test('partial restore keeps valid positions and replaces only missing quadrants', () => {
  const saved = fixture();
  const readable = new Set(codec.sessionUris(saved).filter((uri) => uri !== saved.pool[1].uri));
  const result = codec.prepareSession(saved, readable);
  assert.equal(result.missing, 1);
  assert.equal(result.replacements, 1);
  assert.equal(result.session.streams[0].position, 23.4);
  assert.equal(result.session.streams[1].position, 0);
  assert.equal(result.session.streams[1].muted, true);
  assert.equal(saved.pool.length, 5);
  assert.equal(saved.streams[1].position, 24.4);
});
test('unavailable background tracks are skipped without changing the saved copy', () => {
  const saved = fixture();
  const result = codec.prepareSession(saved, new Set(saved.pool.map((p) => p.uri)));
  assert.equal(result.session.audio.length, 0);
  assert.equal(saved.audio.length, 1);
});
test('no available videos yields no fake/random quadrants', () => {
  const saved = fixture();
  const result = codec.prepareSession(saved, new Set([saved.audio[0].uri]));
  assert.equal(result.session.pool.length, 0);
  assert.equal(result.session.streams.length, 0);
  assert.equal(result.session.audio.length, 1);
});
test('permission inspection only requests unique selected URIs', () => {
  const value = fixture();
  value.audio.push({ ...value.audio[0], ...value.pool[0] });
  assert.equal(codec.sessionUris(value).length, 6);
});

// Exercise the real controls with lightweight hooks/storage/native mocks.
// Native dialogs/URI grants still require a physical Android device.
async function controls({ stored = null, choices = [], writeFails = false, readable, accessFails = false, temporary = false } = {}) {
  let storedValue = stored;
  let hookIndex = 0;
  let rendered = false;
  const hooks = [];
  const effects = [];
  const alerts = [];
  const restored = [];
  const inspected = [];
  const busy = [];
  let writes = 0;
  const element = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const i = hookIndex++;
      if (!(i in hooks)) hooks[i] = initial;
      return [hooks[i], (value) => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
    },
    useRef(initial) {
      const i = hookIndex++;
      if (!(i in hooks)) hooks[i] = { current: initial };
      return hooks[i];
    },
    useEffect(callback) { if (!rendered) effects.push(callback); },
  };
  const storage = {
    async getItem() { return storedValue; },
    async setItem(_key, value) {
      writes++;
      if (writeFails) throw new Error('Disk full');
      storedValue = value;
    },
  };
  const rn = {
    ActivityIndicator: 'Spinner', Pressable: 'Button', Text: 'Text', View: 'View',
    StyleSheet: { create: (s) => s },
    Alert: {
      alert(title, message, buttons, options) {
        alerts.push({ title, message });
        if (buttons) {
          const choice = choices.shift();
          const button = buttons.find((b) => b.text === choice);
          if (button) button.onPress();
          else options.onDismiss();
        }
      },
    },
  };
  const component = await load('../components/SessionControls.tsx', {
    react, 'react/jsx-runtime': { jsx: element, jsxs: element },
    '@react-native-async-storage/async-storage': storage,
    '@expo/vector-icons': { Feather: 'Icon' },
    'react-native': rn,
    '@/hooks/useColors': { useColors: () => ({}) },
    '@/lib/sessions': codec,
    '@/lib/session-media': {
      async inspectSessionMedia(uris, retain) {
        inspected.push({ uris, retain });
        if (accessFails) throw new Error('Access check failed');
        return uris.map((uri) => ({ uri, readable: readable ? readable.has(uri) : true, persistent: !temporary }));
      },
    },
  });
  const props = {
    capture: fixture, restore: (s) => restored.push(s), canSave: true,
    hasCurrent: false, disabled: false, compact: false, onBusyChange: (b) => busy.push(b),
  };
  const render = () => {
    hookIndex = 0;
    const tree = component.default(props);
    rendered = true;
    return tree;
  };
  render();
  effects.forEach((callback) => callback());
  const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
  await flush();
  const find = (tree, label) => {
    if (!tree || typeof tree !== 'object') return null;
    if (tree.props?.accessibilityLabel === label) return tree;
    const children = [tree.props?.children].flat(Infinity);
    for (const child of children) { const result = find(child, label); if (result) return result; }
    return null;
  };
  return {
    props, alerts, restored, inspected, busy,
    stored: () => storedValue, writes: () => writes,
    async press(label) {
      const button = find(render(), label);
      assert.ok(button, `${label} button exists`);
      assert.equal(button.props.disabled, false, `${label} enabled`);
      button.props.onPress();
      await flush();
    },
  };
}
test('Save session writes a complete checkpoint and retains URI grants', async () => {
  const c = await controls();
  await c.press('Save session');
  assert.deepEqual(plain(codec.parseSession(c.stored())), fixture());
  assert.equal(c.inspected[0].retain, true);
  assert.deepEqual(c.busy, [true, false]);
});
test('failed storage write preserves the previous saved session', async () => {
  const previous = JSON.stringify(fixture());
  const c = await controls({ stored: previous, choices: ['Save current'], writeFails: true });
  await c.press('Save session');
  assert.equal(c.stored(), previous);
  assert.equal(c.alerts.at(-1).title, 'Could not save session');
});
test('canceling overwrite leaves storage and live playback alone', async () => {
  const previous = JSON.stringify(fixture());
  const c = await controls({ stored: previous, choices: ['Cancel'] });
  await c.press('Save session');
  assert.equal(c.writes(), 0);
  assert.equal(c.restored.length, 0);
});
test('temporary media access is explicitly reported after saving', async () => {
  const c = await controls({ temporary: true });
  await c.press('Save session');
  assert.match(c.alerts.at(-1).message, /temporary access/);
});
test('Resume saved session validates all files and restores the full mix', async () => {
  const c = await controls({ stored: JSON.stringify(fixture()) });
  await c.press('Resume saved session');
  assert.equal(c.inspected[0].retain, false);
  assert.deepEqual(plain(c.restored[0]), fixture());
  assert.equal(c.writes(), 0);
});
test('canceling replacement does not touch the current mix', async () => {
  const c = await controls({ stored: JSON.stringify(fixture()), choices: ['Cancel'] });
  c.props.hasCurrent = true;
  await c.press('Resume saved session');
  assert.equal(c.restored.length, 0);
  assert.equal(c.inspected.length, 0);
});
test('unreadable media cannot silently replace the current session', async () => {
  const original = JSON.stringify(fixture());
  const c = await controls({ stored: original, readable: new Set() });
  await c.press('Resume saved session');
  assert.equal(c.restored.length, 0);
  assert.equal(c.stored(), original);
  assert.match(c.alerts.at(-1).message, /None of the saved media/);
});
test('partial resume requires confirmation and does not overwrite the saved copy', async () => {
  const saved = fixture();
  const original = JSON.stringify(saved);
  const c = await controls({
    stored: original, choices: ['Resume available'], readable: new Set(saved.pool.map((p) => p.uri)),
  });
  await c.press('Resume saved session');
  assert.equal(c.restored[0].audio.length, 0);
  assert.equal(c.stored(), original);
  assert.equal(c.writes(), 0);
});
test('native access errors leave saved and live sessions untouched', async () => {
  const original = JSON.stringify(fixture());
  const c = await controls({ stored: original, accessFails: true });
  await c.press('Resume saved session');
  assert.equal(c.restored.length, 0);
  assert.equal(c.stored(), original);
});
