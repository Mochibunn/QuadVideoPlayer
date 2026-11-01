export type SlideshowImage = { id: string; name: string; uri: string };
export type SlideshowInstance = {
  id: string; enabled: boolean; index: number; scale: number;
  sourceId?: string;
  opacity: number; x: number; y: number; bounce: boolean; seconds: number; speed: number;
};
export type Slideshow = { enabled: boolean; pool: SlideshowImage[]; instances: SlideshowInstance[] };
export const DEFAULT_INSTANCE: SlideshowInstance = {
  id: 'slideshow-1', enabled: true, index: 0, scale: 30, opacity: 0.8,
  x: 50, y: 50, bounce: true, seconds: 8, speed: 20,
};
export const DEFAULT_SLIDESHOW: Slideshow = { enabled: false, pool: [], instances: [{ ...DEFAULT_INSTANCE }] };
function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function parseSlideshow(value: unknown): Slideshow {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SLIDESHOW, pool: [], instances: [{ ...DEFAULT_INSTANCE }] };
  const v = value as Record<string, unknown>;
  const seen = new Set<string>();
  const pool = Array.isArray(v.pool) ? v.pool.filter((item) => {
    if (!item || typeof item.uri !== 'string' || !/^(content|file):\/\//.test(item.uri) ||
      typeof item.name !== 'string' || !item.name || seen.has(item.uri)) return false;
    seen.add(item.uri); return true;
  }).map((item) => ({ id: item.uri, uri: item.uri, name: item.name })) : [];
  // Older checkpoints stored one overlay's controls directly beside the pool.
  const rawInstances = Array.isArray(v.instances) ? v.instances : [{ ...v, id: 'slideshow-1', enabled: true }];
  const ids = new Set<string>();
  const instances = rawInstances.map((raw, index): SlideshowInstance => {
    const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const seed = typeof item.id === 'string' && item.id.length ? item.id : `slideshow-${index + 1}`;
    let id = seed;
    for (let suffix = 1; ids.has(id); suffix++) id = `${seed}-${suffix}`;
    ids.add(id);
    return {
      id, enabled: item.enabled !== false,
      ...(typeof item.sourceId === 'string' && item.sourceId ? { sourceId: item.sourceId } : {}),
      index: typeof item.sourceId === 'string' && item.sourceId ? Math.floor(bounded(item.index, 0, 0, 1e9)) :
        pool.length ? Math.floor(bounded(item.index, 0, 0, 1e9)) % pool.length : 0,
      scale: bounded(item.scale, 30, 10, 100), opacity: bounded(item.opacity, 0.8, 0, 1),
      x: bounded(item.x, 50, 0, 100), y: bounded(item.y, 50, 0, 100),
      bounce: item.bounce === undefined ? true : item.bounce === true,
      seconds: Math.round(bounded(item.seconds, 8, 1, 60)), speed: bounded(item.speed, 20, 5, 80),
    };
  });
  return { enabled: v.enabled === true, pool, instances };
}
export function addSlideshow(s: Slideshow): Slideshow {
  let number = s.instances.length + 1;
  while (s.instances.some((item) => item.id === `slideshow-${number}`)) number++;
  const instance = {
    ...DEFAULT_INSTANCE, id: `slideshow-${number}`,
    index: s.instances.length % Math.max(1, s.pool.length),
    x: (s.instances.length * 37 + 20) % 101,
    y: (s.instances.length * 61 + 20) % 101,
  };
  return { ...s, enabled: true, instances: [...s.instances, instance] };
}
export function filterSlideshowPool(s: Slideshow, keep: (image: SlideshowImage) => boolean): Slideshow {
  const pool = s.pool.filter(keep);
  return { ...s, pool, instances: s.instances.map((item) => item.sourceId ? item : ({
    ...item, index: Math.max(0, pool.findIndex((image) => image.uri === s.pool[item.index]?.uri)),
  })) };
}
export function snapshotSlideshow(s: Slideshow, runtime: Map<string, { index: number }>): Slideshow {
  return { ...s, instances: s.instances.map((item) => ({
    ...item, index: item.sourceId ? runtime.get(item.id)?.index ?? item.index :
      (runtime.get(item.id)?.index ?? item.index) % Math.max(1, s.pool.length),
  })) };
}
export function isSlideshowImage(file: { name: string; mimeType?: string | null }): boolean {
  return file.mimeType?.toLowerCase().startsWith('image/') === true ||
    /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|apng)$/i.test(file.name);
}
export function slideshowBounds(width: number, height: number, s: SlideshowInstance) {
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
