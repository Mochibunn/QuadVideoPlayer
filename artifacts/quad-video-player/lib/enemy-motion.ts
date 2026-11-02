export type MotionBounds = { minX: number; maxX: number; minY: number; maxY: number };
export type Waypoint = { x: number; y: number; duration: number; rotate: number; hold: number; curve: number };

type Rand = () => number;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Responsive enemy edge length: large on tablets, still usable on phones. */
export function enemySizeFor(width: number, height: number, count: number): number {
  const short = Math.min(width, height);
  const crowd = count >= 4 ? 0.27 : count === 3 ? 0.3 : 0.34;
  return Math.round(clamp(short * crowd, 132, 360));
}

/** Bounds for the sprite's top-left corner so the whole sprite stays on the field. */
export function boundsFor(width: number, height: number, size: number, bottomReserve: number, margin = 10): MotionBounds {
  const minX = margin;
  const minY = margin;
  const maxX = Math.max(minX, width - size - margin);
  const maxY = Math.max(minY, height - size - bottomReserve - margin);
  return { minX, maxX, minY, maxY };
}

export function clampToBounds(point: { x: number; y: number }, bounds: MotionBounds) {
  return { x: clamp(point.x, bounds.minX, bounds.maxX), y: clamp(point.y, bounds.minY, bounds.maxY) };
}

/** Spread spawns across columns so large portraits don't stack on one another. */
export function spawnPoint(bounds: MotionBounds, index: number, count: number, rand: Rand = Math.random) {
  const spanX = bounds.maxX - bounds.minX;
  const column = spanX / Math.max(1, count);
  return {
    x: bounds.minX + column * index + rand() * column * 0.8,
    y: bounds.minY + rand() * (bounds.maxY - bounds.minY),
  };
}

/**
 * Pick an independent next destination. Each call varies the distance, speed, curve
 * and tilt so enemies wander instead of looping one path.
 */
export function nextWaypoint(
  from: { x: number; y: number },
  bounds: MotionBounds,
  calm: boolean,
  rand: Rand = Math.random,
): Waypoint {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const minHop = Math.min(spanX, spanY) * (calm ? 0.15 : 0.25);
  let x = from.x;
  let y = from.y;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    x = bounds.minX + rand() * spanX;
    y = bounds.minY + rand() * spanY;
    if (Math.hypot(x - from.x, y - from.y) >= minHop) break;
  }
  const distance = Math.hypot(x - from.x, y - from.y);
  // Occasional dashes, mostly cruising.
  const dash = !calm && rand() < 0.22;
  const speed = calm ? 35 + rand() * 45 : dash ? 320 + rand() * 260 : 90 + rand() * 170;
  const duration = clamp((distance / speed) * 1000, calm ? 1600 : 380, calm ? 9000 : 5200);
  const tilt = calm ? 4 : 11;
  return {
    x,
    y,
    duration: Math.round(duration),
    rotate: Math.round((rand() * 2 - 1) * tilt * 10) / 10,
    hold: rand() < (calm ? 0.5 : 0.28) ? Math.round(150 + rand() * (calm ? 1200 : 650)) : 0,
    curve: Math.floor(rand() * 4),
  };
}

export type MotionPattern = 'wander' | 'dash' | 'zigzag' | 'orbit' | 'drift';
export type MotionDirective = { pattern: MotionPattern; speed: number; x: number; y: number };

const PATTERN_PROFILE: Record<MotionPattern, { pace: number; hold: number; curve: number; tilt: number }> = {
  dash: { pace: 440, hold: 380, curve: 2, tilt: 1.2 },
  orbit: { pace: 170, hold: 0, curve: 3, tilt: 0.7 },
  zigzag: { pace: 270, hold: 0, curve: 0, tilt: 1 },
  drift: { pace: 60, hold: 650, curve: 3, tilt: 0.4 },
  wander: { pace: 150, hold: 0, curve: 1, tilt: 0.8 },
};

/**
 * Waypoint driven by a model directive: the pattern shapes the path, the normalized
 * focus anchors it, and the speed multiplier scales the pace. Calm limits always win.
 */
export function directedWaypoint(
  from: { x: number; y: number },
  bounds: MotionBounds,
  calm: boolean,
  directive: MotionDirective,
  step: number,
  rand: Rand = Math.random,
): Waypoint {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const fx = bounds.minX + clamp(directive.x, 0, 1) * spanX;
  const fy = bounds.minY + clamp(directive.y, 0, 1) * spanY;
  const profile = PATTERN_PROFILE[directive.pattern] ?? PATTERN_PROFILE.wander;
  let x = fx;
  let y = fy;
  switch (directive.pattern) {
    case 'dash':
      x = fx + (rand() - 0.5) * spanX * 0.12;
      y = fy + (rand() - 0.5) * spanY * 0.12;
      break;
    case 'orbit': {
      const radius = Math.min(spanX, spanY) * 0.28;
      const angle = step * (Math.PI / 3);
      x = fx + Math.cos(angle) * radius;
      y = fy + Math.sin(angle) * radius * 0.8;
      break;
    }
    case 'zigzag': {
      const side = step % 2 === 0 ? 1 : -1;
      x = from.x + (fx - from.x) * 0.5 + side * spanX * 0.18;
      y = from.y + (fy - from.y) * 0.5 - side * spanY * 0.12;
      break;
    }
    case 'drift':
      x = from.x + (fx - from.x) * 0.35 + (rand() - 0.5) * spanX * 0.06;
      y = from.y + (fy - from.y) * 0.35 + (rand() - 0.5) * spanY * 0.06;
      break;
    default:
      x = fx + (rand() - 0.5) * spanX * 0.5;
      y = fy + (rand() - 0.5) * spanY * 0.5;
  }
  const target = clampToBounds({ x, y }, bounds);
  const multiplier = clamp(Number.isFinite(directive.speed) ? directive.speed : 1, 0.5, 1.6);
  const pace = calm ? Math.min(80, profile.pace) * Math.min(1, multiplier) : profile.pace * multiplier;
  const distance = Math.hypot(target.x - from.x, target.y - from.y);
  const duration = clamp((distance / pace) * 1000, calm ? 1600 : 300, calm ? 9000 : 5200);
  const tilt = (calm ? 4 : 11) * profile.tilt;
  return {
    x: target.x,
    y: target.y,
    duration: Math.round(duration),
    rotate: Math.round((step % 2 === 0 ? tilt : -tilt) * 10) / 10,
    hold: calm ? Math.max(400, profile.hold) : profile.hold,
    curve: profile.curve,
  };
}

/** Place a speech bubble above (or below) an anchor sprite, fully inside the field. */
export function bubblePlacement(
  anchor: { x: number; y: number },
  size: number,
  bubble: { width: number; height: number },
  field: { width: number; height: number },
  margin = 8,
): { left: number; top: number; below: boolean } {
  const left = clamp(anchor.x + size / 2 - bubble.width / 2, margin, Math.max(margin, field.width - bubble.width - margin));
  let top = anchor.y - bubble.height - 12;
  const below = top < margin;
  if (below) top = anchor.y + size + 16;
  return { left, top: clamp(top, margin, Math.max(margin, field.height - bubble.height - margin)), below };
}
