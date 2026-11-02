/**
 * Pure geometry for the screen frame. Strips are laid out in global screen
 * coordinates and textures are anchored to the global origin, so every strip
 * (outer edges and the shared centre lines) shows a continuous pattern with no
 * seams, holes, or doubled centre thickness at any scale or scroll phase.
 */
export type BorderLayout = 'quad' | 'single';
export type Rect = { x: number; y: number; width: number; height: number };
export type BorderStrip = Rect & { id: string; axis: 'horizontal' | 'vertical'; center: boolean };
export type TileGrid = { originX: number; originY: number; columns: number; rows: number; tile: number };

export function borderStrips(width: number, height: number, thickness: number, layout: BorderLayout): BorderStrip[] {
  if (!(width > 0) || !(height > 0) || !(thickness > 0)) return [];
  const t = Math.min(thickness, width / 2, height / 2);
  const strips: BorderStrip[] = [
    { id: 'top', axis: 'horizontal', center: false, x: 0, y: 0, width, height: t },
    { id: 'bottom', axis: 'horizontal', center: false, x: 0, y: height - t, width, height: t },
    { id: 'left', axis: 'vertical', center: false, x: 0, y: 0, width: t, height },
    { id: 'right', axis: 'vertical', center: false, x: width - t, y: 0, width: t, height },
  ];
  if (layout === 'quad') {
    // One shared centre line per axis with the same total thickness as an outer edge.
    strips.push(
      { id: 'center-h', axis: 'horizontal', center: true, x: 0, y: height / 2 - t / 2, width, height: t },
      { id: 'center-v', axis: 'vertical', center: true, x: width / 2 - t / 2, y: 0, width: t, height },
    );
  }
  return strips;
}

const mod = (value: number, size: number) => ((value % size) + size) % size;

/**
 * Tiles needed inside a strip (strip-local coordinates) so that, after any
 * translation in [-tile, tile] on each axis, the strip is fully covered and the
 * pattern lines up with the global grid.
 */
export function tileGridForStrip(strip: Rect, tile: number): TileGrid {
  const size = Math.max(1, tile);
  const originX = -size - mod(strip.x, size);
  const originY = -size - mod(strip.y, size);
  return {
    originX, originY, tile: size,
    columns: Math.ceil((strip.width - originX + size) / size),
    rows: Math.ceil((strip.height - originY + size) / size),
  };
}

/** Whether the grid shifted by (shiftX, shiftY) covers the whole strip. */
export function gridCoversStrip(grid: TileGrid, strip: Rect, shiftX: number, shiftY: number): boolean {
  const left = grid.originX + shiftX;
  const top = grid.originY + shiftY;
  return left <= 1e-6 && top <= 1e-6 &&
    left + grid.columns * grid.tile >= strip.width - 1e-6 &&
    top + grid.rows * grid.tile >= strip.height - 1e-6;
}

/**
 * One animation loop moves exactly one tile on each moving axis, which is
 * seamless because the texture repeats every tile. Duration is scaled by the
 * path length so diagonal and cardinal directions travel at the same px/s.
 */
export function scrollLoop(vector: { x: number; y: number }, tile: number, speed: number) {
  const sx = Math.abs(vector.x) > 1e-6 ? Math.sign(vector.x) : 0;
  const sy = Math.abs(vector.y) > 1e-6 ? Math.sign(vector.y) : 0;
  const dx = sx * tile;
  const dy = sy * tile;
  const distance = Math.hypot(dx, dy);
  const clampedSpeed = Math.max(1, Math.min(10, Number.isFinite(speed) ? speed : 3));
  const pxPerSecond = tile * clampedSpeed / 60 * 1; // one tile per (60/speed) s on a cardinal
  const durationMs = distance > 0 ? Math.max(1500, Math.round((distance / pxPerSecond) * 1000)) : 0;
  return { dx, dy, distance, durationMs, pxPerSecond: distance > 0 ? distance / (durationMs / 1000) : 0 };
}

/** Per-frame rectangles for decorative insets: 4 quadrants, or one full frame. */
export function frameRects(width: number, height: number, layout: BorderLayout): Rect[] {
  if (layout === 'single') return [{ x: 0, y: 0, width, height }];
  const w = width / 2;
  const h = height / 2;
  return [
    { x: 0, y: 0, width: w, height: h }, { x: w, y: 0, width: w, height: h },
    { x: 0, y: h, width: w, height: h }, { x: w, y: h, width: w, height: h },
  ];
}
