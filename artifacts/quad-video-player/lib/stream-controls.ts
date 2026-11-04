export function streamAudioMuted(ownMute: boolean, index: number, solo: number | null): boolean {
  return solo === null ? ownMute : solo !== index;
}
export function streamHeaderTop(index: number, focus: number | null, toolbarHeight: number, borderInset: number): number {
  return focus !== null || index < 2 ? Math.max(0, toolbarHeight - borderInset) : 0;
}
export function popPreviousVideo<T extends { id: string }>(history: T[], pool: readonly T[]): T | undefined {
  while (history.length) {
    const candidate = history.pop()!;
    if (pool.some((item) => item.id === candidate.id)) return candidate;
  }
  return undefined;
}
