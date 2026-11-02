export const MIN_BOSS_REMAINING_SECONDS = 15;
export const BOSS_HEALTH_PER_SECOND = 6.5;

/** Boss HP is budgeted from the selected stream's actual remaining runtime. */
export function bossHealthForRemainingSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < MIN_BOSS_REMAINING_SECONDS) return 0;
  return Math.ceil(seconds * BOSS_HEALTH_PER_SECOND);
}
