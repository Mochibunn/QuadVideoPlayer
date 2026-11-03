import type { GestureResponderEvent, PointerEvent } from 'react-native';
import { shouldActivateCombatTap, type CombatControlScheme } from '@/lib/input-controls';

/**
 * Combat buttons fire on touch-down instead of release, so hits register on the beat.
 * Only one handler is attached per scheme, so a single tap can never fire twice.
 */
export function combatPress(scheme: CombatControlScheme, action: () => void): {
  onPressIn?: (event: GestureResponderEvent) => void;
  onPointerDown?: (event: PointerEvent) => void;
} {
  if (scheme === 'spen') {
    return {
      onPointerDown: (event) => {
        if (shouldActivateCombatTap(scheme, event.nativeEvent.pointerType)) action();
      },
    };
  }
  return { onPressIn: () => action() };
}

export const COMBAT_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
