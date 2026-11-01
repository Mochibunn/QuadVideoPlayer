import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/media-formats.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const media = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

for (const extension of media.VIDEO_EXTENSIONS) {
  test(`${extension} is selectable for video and background audio`, () => {
    const file = { name: `clip.${extension.toUpperCase()}`, mimeType: 'application/octet-stream' };
    assert.equal(media.hasVideoExtension(file.name), true);
    assert.equal(media.isVideoFile(file), true);
    assert.equal(media.isBackgroundMediaFile(file), true);
  });
}

for (const extension of media.AUDIO_EXTENSIONS) {
  test(`${extension} is selectable for background audio, not the video pool`, () => {
    const file = { name: `track.${extension.toUpperCase()}` };
    assert.equal(media.isBackgroundMediaFile(file), true);
    assert.equal(media.isVideoFile(file), false);
  });
}

test('provider MIME types work without an extension', () => {
  for (const mimeType of ['video/quicktime', 'Video/WebM; codecs=vp9', 'application/x-matroska', 'application/mp4']) {
    assert.equal(media.isVideoFile({ name: 'clip', mimeType }), true);
    assert.equal(media.isBackgroundMediaFile({ name: 'clip', mimeType }), true);
  }
  for (const mimeType of ['audio/mpeg', 'audio/flac', 'application/ogg']) {
    assert.equal(media.isBackgroundMediaFile({ name: 'track', mimeType }), true);
    assert.equal(media.isVideoFile({ name: 'track', mimeType }), false);
  }
});

test('video source routing explicitly selects progressive playback for local media', () => {
  for (const uri of ['file:///Movies/clip.mp4', 'content://provider/clip.webm', 'file:///clip.mov', 'file:///clip.mkv']) {
    assert.equal(media.videoSourceForUri(uri).uri, uri);
    assert.equal(media.videoSourceForUri(uri).contentType, 'progressive');
  }
  assert.equal(media.videoSourceForUri('https://media.test/live.m3u8').contentType, 'hls');
  assert.equal(media.videoSourceForUri('https://media.test/movie.mpd').contentType, 'dash');
  assert.equal(media.videoSourceForUri('https://media.test/movie.ism/manifest').contentType, 'smoothStreaming');
});

test('unrelated files, misleading extension fragments and extensionless names are rejected', () => {
  for (const name of ['image.jpg', 'notes.pdf', 'clip.mp4.exe', 'mp4', 'notes', 'music.mp3.zip']) {
    assert.equal(media.isVideoFile({ name }), false);
    assert.equal(media.isBackgroundMediaFile({ name }), false);
  }
});

test('folder discovery is case insensitive and uses actual filename extensions', () => {
  assert.equal(media.hasVideoExtension('Holiday.MOV'), true);
  assert.equal(media.hasVideoExtension('movie.webm?download=1'), true);
  assert.equal(media.hasVideoExtension('movie.mkv.backup'), false);
});

test('playback errors explain codec limitations and preserve native details', () => {
  assert.match(media.mediaPlaybackError(), /codec not supported/);
  assert.match(media.mediaPlaybackError('Decoder initialization failed'), /Decoder initialization failed/);
});
