export type SlideshowImage = { id: string; name: string; uri: string };
export type Slideshow = {
  enabled: boolean; pool: SlideshowImage[]; index: number; scale: number;
  opacity: number; x: number; y: number; bounce: boolean; seconds: number; speed: number;
};
export const DEFAULT_SLIDESHOW: Slideshow = {
  enabled: false, pool: [], index: 0, scale: 30, opacity: 0.8,
  x: 50, y: 50, bounce: false, seconds: 8, speed: 20,
};
function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function parseSlideshow(value: unknown): Slideshow {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SLIDESHOW, pool: [] };
  const v = value as Partial<Slideshow>;
  const seen = new Set<string>();
  const pool = Array.isArray(v.pool) ? v.pool.filter((item) => {
    if (!item || typeof item.uri !== 'string' || !/^(content|file):\/\//.test(item.uri) ||
      typeof item.name !== 'string' || !item.name || seen.has(item.uri)) return false;
    seen.add(item.uri); return true;
  }).map((item) => ({ id: item.uri, uri: item.uri, name: item.name })) : [];
  return {
    enabled: v.enabled === true, pool,
    index: pool.length ? Math.floor(bounded(v.index, 0, 0, 1e9)) % pool.length : 0,
    scale: bounded(v.scale, 30, 10, 100), opacity: bounded(v.opacity, 0.8, 0, 1),
    x: bounded(v.x, 50, 0, 100), y: bounded(v.y, 50, 0, 100), bounce: v.bounce === true,
    seconds: Math.round(bounded(v.seconds, 8, 1, 60)), speed: bounded(v.speed, 20, 5, 80),
  };
}
export function isSlideshowImage(file: { name: string; mimeType?: string | null }): boolean {
  return file.mimeType?.toLowerCase().startsWith('image/') === true ||
    /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|apng)$/i.test(file.name);
}
export function slideshowBounds(width: number, height: number, s: Slideshow) {
  const w = Math.max(0, width) * s.scale / 100;
  const h = Math.max(0, height) * s.scale / 100;
  const maxX = Math.max(0, width - w);
  const maxY = Math.max(0, height - h);
  return { width: w, height: h, maxX, maxY, x: maxX * s.x / 100, y: maxY * s.y / 100 };
}
export function bounceTiming(start: number, max: number, speed: number) {
  return {
    initial: Math.max(16, (max - start) / Math.max(1, speed) * 1000),
    crossing: Math.max(16, max / Math.max(1, speed) * 1000),
  };
}
export function bounceKeyframes(start: number, max: number) {
  if (max <= 0) return { inputRange: [0, 1], outputRange: [0, 0] };
  const phase = start / (2 * max);
  const inputRange = [0];
  const outputRange = [start];
  for (const [time, value] of [[0.5 - phase, max], [1 - phase, 0]]) {
    if (time > 0 && time < 1) { inputRange.push(time); outputRange.push(value); }
  }
  inputRange.push(1); outputRange.push(start);
  return { inputRange, outputRange };
}
