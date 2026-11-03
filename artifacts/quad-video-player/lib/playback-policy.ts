/** Use at native event/async boundaries, not just when the focus button changes. */
export function slotMayPlay(globalPlaying: boolean, focusIndex: number | null, slot: number): boolean {
  return globalPlaying && (focusIndex === null || focusIndex === slot);
}
