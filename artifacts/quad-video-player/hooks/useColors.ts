import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';

export type ColorTokens = typeof colors.dark;
export const ColorContext = createContext<ColorTokens | null>(null);

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Falls back to the light palette when no dark key is defined in
 * constants/colors.ts (the scaffold ships light-only by default).
 * When a sibling web artifact's dark tokens are synced into a `dark`
 * key, this hook will automatically switch palettes based on the
 * device's appearance setting.
 */
export function useColors() {
  const selectedColors = useContext(ColorContext);
  const scheme = useColorScheme();
  const palette =
    selectedColors ?? (scheme === 'dark' ? colors.dark : colors.light);
  return { ...palette, radius: colors.radius };
}
