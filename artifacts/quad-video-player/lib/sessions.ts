import { parseSoundSettings, type SoundSettings } from './sound-settings';
import { filterSlideshowPool, parseSlideshow, type Slideshow } from './slideshow';
import { parseOnlineSources, publicMediaUrl, type OnlineSource } from './online-sources';

export const SESSION_KEY = 'quad-video-player.saved-session.v1';
export type SessionMedia = { id: string; uri: string; name: string };
export type VideoSnapshot = {
  asset: SessionMedia; position: number; volume: number; muted: boolean; playing: boolean;
};
export type AudioSnapshot = {
  id: string; uri: string; name: string; position: number; volume: number; muted: boolean; paused: boolean;
};
export type SessionSnapshot = {
  version: 1; savedAt: string; pool: SessionMedia[]; streams: VideoSnapshot[];
  audio: AudioSnapshot[]; sourceLabel: string; globalPlaying: boolean;
  slideshow?: Slideshow;
  sources?: OnlineSource[];
  settings: {
    themeId: string; normalize: boolean; sync: boolean; fill: boolean;
    controlsDelay: number; sharedVolume: number; sound: SoundSettings;
  };
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The saved session is damaged.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 16384) throw new Error('The saved session contains invalid media details.');
  return value;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('The saved session contains invalid playback settings.');
  return Math.min(max, Math.max(min, value));
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('The saved session contains invalid playback settings.');
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('The saved session contains an invalid media list.');
  return value;
}
function media(value: unknown): SessionMedia {
  const v = record(value);
  const uri = text(v.uri);
  if (!/^(content|file):\/\//.test(uri) && !publicMediaUrl(uri)) throw new Error('The saved session contains an unsupported media address.');
  return { id: uri, uri, name: text(v.name) };
}
export function parseSession(raw: string): SessionSnapshot {
  const v = record(JSON.parse(raw));
  if (v.version !== 1) throw new Error('This saved session uses an unsupported version.');
  const savedAt = text(v.savedAt);
  if (!Number.isFinite(Date.parse(savedAt))) throw new Error('The saved session has an invalid save date.');
  const pool = list(v.pool).map(media);
  if (new Set(pool.map((item) => item.uri)).size !== pool.length) throw new Error('The saved video pool has duplicate files.');
  const streams = list(v.streams).map((item): VideoSnapshot => {
    const s = record(item);
    const asset = media(s.asset);
    if (!pool.some((p) => p.uri === asset.uri)) throw new Error('A saved stream is not in its video pool.');
    return { asset, position: number(s.position, 0, 1e9), volume: number(s.volume, 0, 1), muted: bool(s.muted), playing: bool(s.playing) };
  });
  if (streams.length !== 0 && streams.length !== 4) throw new Error('The saved session must contain four video quadrants.');
  const audio = list(v.audio).map((item): AudioSnapshot => {
    const s = record(item);
    return { ...media(s), position: number(s.position, 0, 1e9), volume: number(s.volume, 0, 2), muted: bool(s.muted), paused: bool(s.paused) };
  });
  if (new Set(audio.map((item) => item.uri)).size !== audio.length) throw new Error('The saved audio mix has duplicate tracks.');
  const s = record(v.settings);
  return {
    version: 1, savedAt, pool, streams, audio,
    sourceLabel: typeof v.sourceLabel === 'string' ? v.sourceLabel : 'Saved session',
    globalPlaying: bool(v.globalPlaying),
    ...(v.slideshow !== undefined ? { slideshow: parseSlideshow(v.slideshow) } : {}),
    ...(v.sources !== undefined ? { sources: parseOnlineSources(v.sources) } : {}),
    settings: {
      themeId: text(s.themeId), normalize: bool(s.normalize), sync: bool(s.sync), fill: bool(s.fill),
      controlsDelay: Math.round(number(s.controlsDelay, 0, 30)), sharedVolume: number(s.sharedVolume, 0, 1),
      sound: parseSoundSettings(JSON.stringify(s.sound)),
    },
  };
}
export function sessionUris(session: SessionSnapshot): string[] {
  return [...new Set([...session.pool.map((p) => p.uri), ...session.audio.map((p) => p.uri),
    ...(session.slideshow?.pool.map((p) => p.uri) ?? [])])];
}
export function prepareSession(session: SessionSnapshot, readable: Set<string>) {
  const pool = session.pool.filter((item) => readable.has(item.uri));
  const audio = session.audio.filter((item) => readable.has(item.uri));
  const slideshow = session.slideshow ? filterSlideshowPool(session.slideshow, (item) => readable.has(item.uri)) : undefined;
  let replacements = 0;
  const streams = pool.length ? session.streams.map((stream, index) => {
    if (readable.has(stream.asset.uri)) return stream;
    replacements++;
    return { ...stream, asset: pool[index % pool.length], position: 0 };
  }) : [];
  return {
    session: { ...session, pool, audio, streams, ...(slideshow ? { slideshow } : {}) },
    missing: sessionUris(session).filter((uri) => !readable.has(uri)).length,
    replacements,
  };
}
export function seekPosition(position: number, duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? Math.min(position, Math.max(0, duration - 0.05)) : position;
}
