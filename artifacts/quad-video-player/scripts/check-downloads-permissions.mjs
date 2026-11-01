import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/downloads-permissions.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { DOWNLOADS_PERMISSIONS: p, permissionsForDownloads, downloadsAccess } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

for (const api of [26, 28, 29, 32]) {
  test(`Android API ${api} requests legacy media reading`, () => {
    assert.deepEqual(permissionsForDownloads(api), [p.legacy]);
    assert.equal(downloadsAccess(api, { [p.legacy]: true }), 'full');
  });
}
test('Android 13 requests only the video permission', () => {
  assert.deepEqual(permissionsForDownloads(33), [p.video]);
  assert.equal(downloadsAccess(33, { [p.video]: true }), 'full');
});
for (const api of [34, 36, 37]) {
  test(`Android API ${api} supports full and selected-only video access`, () => {
    assert.deepEqual(permissionsForDownloads(api), [p.video, p.selected]);
    assert.equal(downloadsAccess(api, { [p.video]: true }), 'full');
    assert.equal(downloadsAccess(api, { [p.selected]: true }), 'limited');
    assert.equal(downloadsAccess(api, { [p.video]: true, [p.selected]: true }), 'full');
  });
}
test('a selected-video grant is not treated as full library access', () => {
  assert.equal(downloadsAccess(34, { [p.video]: false, [p.selected]: true }), 'limited');
});
test('obsolete or irrelevant grants do not imply access', () => {
  assert.equal(downloadsAccess(36, { [p.legacy]: true }), 'denied');
  assert.equal(downloadsAccess(33, { [p.selected]: true }), 'denied');
  assert.equal(downloadsAccess(28, { [p.video]: true }), 'denied');
});
test('denied permissions remain denied', () => {
  for (const api of [26, 33, 34, 36]) {
    assert.equal(downloadsAccess(api, {}), 'denied');
    assert.equal(downloadsAccess(api, { [p.video]: false, [p.selected]: false, [p.legacy]: false }), 'denied');
  }
});
test('the shortcut does not request image, audio, write, or manage-all-files permissions', () => {
  for (const api of [26, 32, 33, 34, 37]) {
    for (const permission of permissionsForDownloads(api)) {
      assert.ok([p.legacy, p.video, p.selected].includes(permission));
      assert.doesNotMatch(permission, /IMAGES|AUDIO|WRITE|MANAGE_EXTERNAL/);
    }
  }
});
