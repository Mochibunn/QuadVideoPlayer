/** Enemy-count planning for the image den. Bounded so sprites stay legible and cheap to animate. */
export const MIN_DEN_ENEMIES = 1;
export const MAX_DEN_ENEMIES = 12;
export const MAX_ENEMIES_PER_WAVE = MAX_DEN_ENEMIES;
export const MAX_DEN_WAVES = 3;
export const DEFAULT_DEN_ENEMIES = 3;

export function clampEnemyCount(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : DEFAULT_DEN_ENEMIES;
  return Math.max(MIN_DEN_ENEMIES, Math.min(MAX_DEN_ENEMIES, n));
}

/** The slider selects simultaneous on-screen enemies, not a hidden total split. */
export function planWaves(simultaneous: number): number[] {
  const count = clampEnemyCount(simultaneous);
  return Array.from({ length: MAX_DEN_WAVES }, () => count);
}

/**
 * Applies damage against a snapshot. Returns null when the hit must be ignored
 * (target missing or already down) so a duplicate press can never deal damage twice.
 */
export function applyEnemyHit<T extends { id: string; hp: number }>(
  enemies: readonly T[], enemyId: string, damage: number,
): { next: T[]; defeated: T | null } | null {
  const target = enemies.find((enemy) => enemy.id === enemyId);
  if (!target || target.hp <= 0 || damage <= 0) return null;
  const hp = Math.max(0, target.hp - damage);
  return {
    next: enemies.map((enemy) => enemy.id === enemyId ? { ...enemy, hp } : enemy),
    defeated: hp === 0 ? target : null,
  };
}
