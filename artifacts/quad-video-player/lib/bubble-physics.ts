export type BubbleBody = {
  id: string;
  x: number; y: number; width: number; height: number;
  minX: number; maxX: number; minY: number; maxY: number;
  vx: number; vy: number;
};
export type BubblePosition = { x: number; y: number };
type RegisteredBody = { body: BubbleBody; onMove: (position: BubblePosition) => void };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const reflectAtWalls = (body: BubbleBody) => {
  const maxX = Math.max(body.minX, body.maxX - body.width);
  const maxY = Math.max(body.minY, body.maxY - body.height);
  if (body.x <= body.minX) { body.x = body.minX; body.vx = Math.abs(body.vx); }
  else if (body.x >= maxX) { body.x = maxX; body.vx = -Math.abs(body.vx); }
  if (body.y <= body.minY) { body.y = body.minY; body.vy = Math.abs(body.vy); }
  else if (body.y >= maxY) { body.y = maxY; body.vy = -Math.abs(body.vy); }
};
const overlaps = (a: BubbleBody, b: BubbleBody) =>
  a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y;

/** Advances equal-mass, axis-aligned screen bubbles with wall and pair collisions. */
export function stepBubbles(input: readonly BubbleBody[], dtSeconds: number): BubbleBody[] {
  const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.05);
  const bodies = input.map((body) => ({ ...body }));
  bodies.forEach((body) => {
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    reflectAtWalls(body);
  });
  // Multiple passes settle clusters where several bubbles reach the same contact zone.
  for (let pass = 0; pass < Math.min(64, Math.max(3, bodies.length * 2)); pass++) {
    let found = false;
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      if (!overlaps(a, b)) continue;
      found = true;
      const overlapX = Math.min(a.x + a.width - b.x, b.x + b.width - a.x);
      const overlapY = Math.min(a.y + a.height - b.y, b.y + b.height - a.y);
      const separate = (axis: 'x' | 'y') => {
        const sizeKey = axis === 'x' ? 'width' : 'height';
        const minKey = axis === 'x' ? 'minX' : 'minY';
        const maxKey = axis === 'x' ? 'maxX' : 'maxY';
        const velocityKey = axis === 'x' ? 'vx' : 'vy';
        const centerA = a[axis] + a[sizeKey] / 2;
        const centerB = b[axis] + b[sizeKey] / 2;
        const sign = centerA <= centerB ? 1 : -1;
        const penetration = axis === 'x' ? overlapX : overlapY;
        const availableA = sign > 0
          ? a[axis] - a[minKey] : a[maxKey] - a[sizeKey] - a[axis];
        const availableB = sign > 0
          ? b[maxKey] - b[sizeKey] - b[axis] : b[axis] - b[minKey];
        if (availableA + availableB + 0.01 < penetration) return false;
        const moveA = Math.min(penetration / 2, Math.max(0, availableA));
        const moveB = penetration - moveA;
        a[axis] -= sign * moveA;
        b[axis] += sign * moveB;
        if ((a[velocityKey] - b[velocityKey]) * sign > 0) {
          [a[velocityKey], b[velocityKey]] = [b[velocityKey], a[velocityKey]];
        }
        return true;
      };
      const xFirst = overlapX <= overlapY;
      if (!(xFirst ? separate('x') || separate('y') : separate('y') || separate('x'))) continue;
      reflectAtWalls(a); reflectAtWalls(b);
    }
    if (!found) break;
  }
  return bodies;
}

class BubbleWorld {
  private bodies = new Map<string, RegisteredBody>();
  private frame: number | null = null;
  private lastTime = 0;

  register(body: BubbleBody, onMove: (position: BubblePosition) => void): () => void {
    this.bodies.set(body.id, { body: { ...body }, onMove });
    if (this.frame === null && typeof requestAnimationFrame === 'function') {
      this.lastTime = 0;
      this.frame = requestAnimationFrame(this.tick);
    }
    return () => {
      this.bodies.delete(body.id);
      if (!this.bodies.size && this.frame !== null) {
        cancelAnimationFrame(this.frame);
        this.frame = null;
      }
    };
  }

  private tick = (time: number) => {
    this.frame = null;
    if (!this.bodies.size) return;
    const dt = this.lastTime ? Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000)) : 1 / 60;
    this.lastTime = time;
    const moved = stepBubbles([...this.bodies.values()].map(({ body }) => body), dt);
    moved.forEach((body) => {
      const registered = this.bodies.get(body.id);
      if (!registered) return;
      registered.body = body;
      registered.onMove({ x: body.x, y: body.y });
    });
    this.frame = requestAnimationFrame(this.tick);
  };
}

export const bubbleWorld = new BubbleWorld();
