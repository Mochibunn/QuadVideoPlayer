export type VideoAsset = {
  id: string;
  name: string;
  uri: string;
  lastPlayedAt?: number;
};

export type VideoWatchHistory = Record<string, number>;

export const VIDEO_WATCH_HISTORY_KEY = 'quad-video-player.video-watch-history';

export function parseVideoWatchHistory(raw: string | null): VideoWatchHistory {
  if (raw === null) return {};
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new Error('The saved video watch history is damaged.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The saved video watch history has an invalid format.');
  }
  const result: VideoWatchHistory = {};
  for (const [uri, timestamp] of Object.entries(value)) {
    if (uri.length > 16000 || !uri || typeof timestamp !== 'number' ||
      !Number.isFinite(timestamp) || timestamp < 0) continue;
    result[uri] = timestamp;
  }
  return result;
}

export function applyVideoWatchHistory<T extends VideoAsset>(
  pool: T[],
  history: VideoWatchHistory,
): T[] {
  return pool.map((asset) => {
    const lastPlayedAt = history[asset.uri] ?? asset.lastPlayedAt;
    if (lastPlayedAt === undefined) {
      const { lastPlayedAt: _discarded, ...clean } = asset;
      return clean as T;
    }
    return { ...asset, lastPlayedAt };
  });
}

function lastPlayed(asset: VideoAsset) {
  return asset.lastPlayedAt ?? 0;
}

function pickOldest<T extends VideoAsset>(candidates: T[], random: () => number): T | undefined {
  if (!candidates.length) return undefined;
  const oldest = Math.min(...candidates.map(lastPlayed));
  const oldestItems = candidates.filter((asset) => lastPlayed(asset) === oldest);
  const value = random();
  const sample = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
  return oldestItems[Math.floor(sample * oldestItems.length)];
}

export function pickInitialVideos<T extends VideoAsset>(
  pool: T[],
  random: () => number = Math.random,
  streamCount = 4,
): T[] {
  if (!pool.length) return [];
  const remaining = [...pool];
  const selected: T[] = [];
  while (selected.length < streamCount && remaining.length) {
    const next = pickOldest(remaining, random);
    if (!next) break;
    selected.push(next);
    remaining.splice(remaining.findIndex((asset) => asset.id === next.id), 1);
  }
  while (selected.length < streamCount) {
    selected.push(pickOldest(pool, random)!);
  }
  return selected;
}

export function pickNextVideo<T extends VideoAsset>(
  pool: T[],
  currentId: string,
  activeElsewhere: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): T | undefined {
  if (!pool.length) return undefined;
  const notCurrent = pool.filter((asset) => asset.id !== currentId);
  if (!notCurrent.length) return pool[0];
  const available = notCurrent.filter((asset) => !activeElsewhere.has(asset.id));
  return pickOldest(available.length ? available : notCurrent, random);
}

export function formatLastPlayed(timestamp: number | undefined): string {
  if (timestamp === undefined) return 'Never played · prioritized';
  return `Last played ${new Date(timestamp).toLocaleString()}`;
}
