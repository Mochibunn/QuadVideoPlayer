export type CombatControlScheme = 'touch' | 'spen';

export function shouldActivateCombatTap(
  scheme: CombatControlScheme,
  pointerType: string | undefined,
): boolean {
  return scheme === 'touch' || pointerType === 'pen';
}
