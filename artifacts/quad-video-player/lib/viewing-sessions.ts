export const VIEWING_SESSIONS_KEY = 'quad.player.viewing-sessions.v1';
export const VIEWING_ACHIEVEMENT_MS = 60 * 60 * 1000;
export const VIEWING_RECOVERY_WINDOW_MS = 15_000;
export const VIEWING_SESSION_LIMIT = 100;
export type HeartRateStats = { min: number; max: number; sum: number; count: number };
export type ActiveViewingSession = {
  id: string; startedAtMs: number; elapsedMs: number; resumedAtMs: number | null; lastCheckpointMs: number;
  watchedVideoIds: string[];
  heartRate?: HeartRateStats | null;
};
export type FinishedViewingSession = {
  id: string; startedAtMs: number; finishedAtMs: number; durationMs: number; watchedVideoCount: number;
  heartRate?: HeartRateStats | null;
};
export type ViewingSessionStore = {
  version: 1; totalPlaybackMs: number; leaderboard: FinishedViewingSession[]; active: ActiveViewingSession | null;
  totalVideosWatched?: number;
  heartRate?: HeartRateStats | null;
};
export const emptyViewingSessions = (): ViewingSessionStore =>
  ({ version: 1, totalPlaybackMs: 0, totalVideosWatched: 0, heartRate: null, leaderboard: [], active: null });

export function mergeHeartRateStats(a: HeartRateStats | null | undefined, b: HeartRateStats | null | undefined): HeartRateStats | null {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max), sum: a.sum + b.sum, count: a.count + b.count };
}
function parseHeartRateStats(value: unknown): HeartRateStats | null {
  if (value === undefined || value === null) return null;
  const row = object(value);
  const min = row.min as number, max = row.max as number, sum = row.sum as number, count = row.count as number;
  if (![min, max, sum, count].every(Number.isSafeInteger) || min < 20 || max > 250 ||
    max < min || count < 1 || sum < min * count || sum > max * count) {
    throw new Error('The playback history contains invalid heart-rate statistics.');
  }
  return { min, max, sum, count };
}
export function recordHeartRate(store: ViewingSessionStore, bpm: number): ViewingSessionStore {
  if (!store.active || store.active.resumedAtMs === null || !Number.isInteger(bpm) || bpm < 20 || bpm > 250) return store;
  const sample = { min: bpm, max: bpm, sum: bpm, count: 1 };
  return { ...store, active: { ...store.active, heartRate: mergeHeartRateStats(store.active.heartRate, sample) } };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The playback history is damaged.');
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > Date.now() + 24 * 60 * 60 * 1000) {
    throw new Error('The playback history contains an invalid date.');
  }
  return value;
}
function duration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('The playback history contains an invalid time.');
  }
  return value;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w-]{1,100}$/.test(value)) {
    throw new Error('The playback history contains an invalid session.');
  }
  return value;
}
function videoIdentifiers(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20_000 ||
    value.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 4096)) {
    throw new Error('The playback history contains invalid video statistics.');
  }
  return [...new Set(value as string[])];
}
function sortLeaderboard(entries: FinishedViewingSession[]): FinishedViewingSession[] {
  return [...entries].sort((a, b) => b.durationMs - a.durationMs || b.finishedAtMs - a.finishedAtMs || a.id.localeCompare(b.id))
    .slice(0, VIEWING_SESSION_LIMIT);
}
export function parseViewingSessions(raw: string | null): ViewingSessionStore {
  if (!raw) return emptyViewingSessions();
  const data = object(JSON.parse(raw));
  if (data.version !== 1 || !Array.isArray(data.leaderboard) || data.leaderboard.length > VIEWING_SESSION_LIMIT) {
    throw new Error('The playback history has an unsupported format.');
  }
  const leaderboard = data.leaderboard.map((item): FinishedViewingSession => {
    const row = object(item);
    const startedAtMs = timestamp(row.startedAtMs);
    const finishedAtMs = timestamp(row.finishedAtMs);
    if (finishedAtMs < startedAtMs) throw new Error('The completed session date is invalid.');
    return { id: identifier(row.id), startedAtMs, finishedAtMs, durationMs: duration(row.durationMs),
      watchedVideoCount: duration(row.watchedVideoCount ?? 0), heartRate: parseHeartRateStats(row.heartRate) };
  });
  if (new Set(leaderboard.map((item) => item.id)).size !== leaderboard.length) {
    throw new Error('The playback history contains duplicate sessions.');
  }
  let active: ActiveViewingSession | null = null;
  if (data.active !== null) {
    const row = object(data.active);
    const resumedAtMs = row.resumedAtMs === null ? null : timestamp(row.resumedAtMs);
    const lastCheckpointMs = timestamp(row.lastCheckpointMs);
    active = { id: identifier(row.id), startedAtMs: timestamp(row.startedAtMs),
      elapsedMs: duration(row.elapsedMs), resumedAtMs, lastCheckpointMs,
      watchedVideoIds: videoIdentifiers(row.watchedVideoIds), heartRate: parseHeartRateStats(row.heartRate) };
    if (resumedAtMs !== null && resumedAtMs < active.startedAtMs) throw new Error('The active session date is invalid.');
  }
  return { version: 1, totalPlaybackMs: duration(data.totalPlaybackMs), leaderboard: sortLeaderboard(leaderboard), active,
    totalVideosWatched: duration(data.totalVideosWatched ?? leaderboard.reduce((sum, item) => sum + item.watchedVideoCount, 0)),
    heartRate: data.heartRate === undefined
      ? leaderboard.reduce<HeartRateStats | null>((stats, item) => mergeHeartRateStats(stats, item.heartRate), null)
      : parseHeartRateStats(data.heartRate) };
}
export function recoverViewingSessions(store: ViewingSessionStore, now: number): ViewingSessionStore {
  const active = store.active;
  if (!active || active.resumedAtMs === null) return store;
  const savedPlayback = Math.min(VIEWING_RECOVERY_WINDOW_MS, Math.max(0, now - active.lastCheckpointMs));
  return { ...store, active: { ...active, elapsedMs: active.elapsedMs + savedPlayback, resumedAtMs: null, lastCheckpointMs: now } };
}
export function elapsedViewingTime(active: ActiveViewingSession, now: number): number {
  return active.elapsedMs + (active.resumedAtMs === null ? 0 : Math.max(0, now - active.resumedAtMs));
}
export function recordWatchedVideos(store: ViewingSessionStore, ids: readonly string[]): ViewingSessionStore {
  if (!store.active || ids.length === 0) return store;
  const watched = new Set(store.active.watchedVideoIds);
  for (const id of ids) {
    if (id.length > 0 && id.length <= 4096) watched.add(id);
  }
  if (watched.size === store.active.watchedVideoIds.length) return store;
  return { ...store, active: { ...store.active, watchedVideoIds: [...watched] } };
}
export function formatViewingTime(milliseconds: number): string {
  if (milliseconds > 0 && milliseconds < 1000) return '< 1s';
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  const clock = `${pad(minutes)}:${pad(remainder)}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}
export function finishViewingSession(store: ViewingSessionStore, now: number) {
  if (!store.active) return { store, completed: null as FinishedViewingSession | null };
  const completed = { id: store.active.id, startedAtMs: store.active.startedAtMs, finishedAtMs: now,
    durationMs: elapsedViewingTime(store.active, now), watchedVideoCount: store.active.watchedVideoIds.length,
    heartRate: store.active.heartRate ?? null };
  return { store: { version: 1 as const,
    totalPlaybackMs: store.totalPlaybackMs + completed.durationMs,
    totalVideosWatched: (store.totalVideosWatched ?? store.leaderboard.reduce((sum, item) => sum + item.watchedVideoCount, 0)) + completed.watchedVideoCount,
    heartRate: mergeHeartRateStats(store.heartRate, completed.heartRate),
    leaderboard: completed.durationMs > 0 ? sortLeaderboard([...store.leaderboard, completed]) : store.leaderboard,
    active: null },
    completed };
}
export function localSessionDate(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString();
}
