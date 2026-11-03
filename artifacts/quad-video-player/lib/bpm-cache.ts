export type CachedVideoBpm = {
  bpm: number | null; confidence: number; error?: string; analyzedSeconds?: number;
};
export const BPM_CACHE_KEY = 'goon-quest.video-bpm.v1';
export type BpmCache = Record<string, CachedVideoBpm>;
export function parseBpmCache(raw: string | null): BpmCache {
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The BPM cache is damaged. Use Rescan pool to rebuild it.');
  const result: BpmCache = Object.create(null);
  for (const [uri, rawEntry] of Object.entries(value).slice(-5000)) {
    if (!uri || uri.length > 16_000 || !rawEntry || typeof rawEntry !== 'object') continue;
    const entry = rawEntry as CachedVideoBpm;
    if (entry.bpm !== null && (!Number.isFinite(entry.bpm) || entry.bpm < 40 || entry.bpm > 240)) continue;
    if (!Number.isFinite(entry.confidence) || entry.confidence < 0 || entry.confidence > 1) continue;
    result[uri] = { bpm: entry.bpm, confidence: entry.confidence,
      ...(typeof entry.error === 'string' ? { error: entry.error.slice(0, 500) } : {}),
      ...(typeof entry.analyzedSeconds === 'number' && Number.isFinite(entry.analyzedSeconds)
        ? { analyzedSeconds: Math.max(0, entry.analyzedSeconds) } : {}) };
  }
  return result;
}
export function averageVideoBpm(results: readonly (CachedVideoBpm | undefined)[]): number | null {
  const values = results.flatMap((result) => result?.bpm && !result.error ? [result.bpm] : []);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}
