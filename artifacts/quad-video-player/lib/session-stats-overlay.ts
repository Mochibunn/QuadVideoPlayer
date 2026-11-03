export const SESSION_STATS_OVERLAY_KEY = 'quad.session-stats-overlay.v1';

export type HeartRateAggregate = { min: number; max: number; sum: number; count: number };

export const STATS_POSITION_PRESETS = [
  { id: 'top-left', label: 'Top left', x: 3, y: 4 },
  { id: 'top-right', label: 'Top right', x: 97, y: 4 },
  { id: 'bottom-left', label: 'Bottom left', x: 3, y: 96 },
  { id: 'bottom-right', label: 'Bottom right', x: 97, y: 96 },
  { id: 'top-center', label: 'Top center', x: 50, y: 4 },
  { id: 'custom', label: 'Custom', x: 50, y: 50 },
] as const;
export type StatsPositionPreset = (typeof STATS_POSITION_PRESETS)[number]['id'];

export const STATS_COLOR_OPTIONS = [
  { id: 'theme', label: 'Theme' },
  { id: 'ink', label: 'Moonlight' },
  { id: 'trans-blue', label: 'Sky' },
  { id: 'trans-pink', label: 'Blush' },
  { id: 'gold', label: 'Gold' },
  { id: 'mint', label: 'Mint' },
] as const;
export type StatsColorId = (typeof STATS_COLOR_OPTIONS)[number]['id'];
export const STATS_FIXED_COLORS: Record<Exclude<StatsColorId, 'theme'>, string> = {
  ink: '#f2eefb', 'trans-blue': '#5BCEFA', 'trans-pink': '#F5A9B8', gold: '#ffd248', mint: '#7fe0b4',
};

export const STATS_FONT_MIN = 11;
export const STATS_FONT_MAX = 40;

export type SessionStatsSettings = {
  enabled: boolean;
  showTime: boolean;
  showHeartRate: boolean;
  showHeartRange: boolean;
  showVideos: boolean;
  showLifetimeVideos: boolean;
  showAverageBpm: boolean;
  color: StatsColorId;
  fontSize: number;
  position: StatsPositionPreset;
  x: number;
  y: number;
};

export const DEFAULT_SESSION_STATS: SessionStatsSettings = {
  enabled: false, showTime: true, showHeartRate: true, showHeartRange: false, showVideos: true, showLifetimeVideos: false, showAverageBpm: false,
  color: 'theme', fontSize: 15, position: 'top-left', x: 3, y: 4,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const clampPercent = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(clamp(value, 0, 100)) : fallback;
export const clampStatsFont = (value: unknown, fallback = DEFAULT_SESSION_STATS.fontSize) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(clamp(value, STATS_FONT_MIN, STATS_FONT_MAX)) : fallback;

/** Throws on corrupted JSON so the UI can surface an explicit error; unknown fields fall back to defaults. */
export function parseSessionStatsSettings(raw: string | null): SessionStatsSettings {
  if (!raw) return { ...DEFAULT_SESSION_STATS };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('The stats overlay settings are damaged.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The stats overlay settings are damaged.');
  const v = data as Record<string, unknown>;
  const d = DEFAULT_SESSION_STATS;
  const bool = (key: keyof SessionStatsSettings) => typeof v[key] === 'boolean' ? v[key] as boolean : d[key] as boolean;
  const position = STATS_POSITION_PRESETS.some((p) => p.id === v.position) ? v.position as StatsPositionPreset : d.position;
  const color = STATS_COLOR_OPTIONS.some((c) => c.id === v.color) ? v.color as StatsColorId : d.color;
  return {
    enabled: bool('enabled'), showTime: bool('showTime'), showHeartRate: bool('showHeartRate'),
     showHeartRange: bool('showHeartRange'), showVideos: bool('showVideos'), showLifetimeVideos: bool('showLifetimeVideos'), showAverageBpm: bool('showAverageBpm'),
    color, fontSize: clampStatsFont(v.fontSize), position, x: clampPercent(v.x, d.x), y: clampPercent(v.y, d.y),
  };
}

export function applyPositionPreset(settings: SessionStatsSettings, id: StatsPositionPreset): SessionStatsSettings {
  const preset = STATS_POSITION_PRESETS.find((p) => p.id === id);
  if (!preset || id === 'custom') return { ...settings, position: 'custom' };
  return { ...settings, position: id, x: preset.x, y: preset.y };
}

/** Top-left pixel for a readout of size (w,h) at percentage (x,y), kept fully on screen. */
export function overlayOrigin(viewW: number, viewH: number, w: number, h: number, xPct: number, yPct: number) {
  return {
    left: Math.max(0, viewW - w) * clamp(xPct, 0, 100) / 100,
    top: Math.max(0, viewH - h) * clamp(yPct, 0, 100) / 100,
  };
}

export function isValidHeartRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 25 && value <= 250;
}

export function addHeartSample(agg: HeartRateAggregate | null, bpm: number): HeartRateAggregate {
  if (!agg || agg.count <= 0) return { min: bpm, max: bpm, sum: bpm, count: 1 };
  return { min: Math.min(agg.min, bpm), max: Math.max(agg.max, bpm), sum: agg.sum + bpm, count: agg.count + 1 };
}

/** Reads an optional aggregate defensively. Returns null when there are no real samples. */
export function readHeartAggregate(value: unknown): HeartRateAggregate | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (!ok(v.min) || !ok(v.max) || !ok(v.sum) || !ok(v.count) || (v.count as number) <= 0) return null;
  return { min: v.min as number, max: v.max as number, sum: v.sum as number, count: v.count as number };
}

export function heartSummary(value: unknown): { min: string; avg: string; max: string; text: string } {
  const agg = readHeartAggregate(value);
  if (!agg) return { min: '—', avg: '—', max: '—', text: '—' };
  const min = String(Math.round(agg.min));
  const avg = String(Math.round(agg.sum / agg.count));
  const max = String(Math.round(agg.max));
  return { min, avg, max, text: `${min} / ${avg} / ${max} bpm` };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
