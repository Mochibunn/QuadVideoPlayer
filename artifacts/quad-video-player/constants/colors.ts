/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

export const themePresets = [
  { id: 'amethyst', name: 'GameCubed', primary: '#6b5cb1', accent: '#211b36', accentForeground: '#e4ddff' },
  { id: 'silver', name: 'Silver', primary: '#dddddd', accent: '#292929', accentForeground: '#f2f2f2' },
  { id: 'emerald', name: 'Emerald', primary: '#109b61', accent: '#0d2a1d', accentForeground: '#c6f3db' },
  { id: 'coral', name: 'Coral', primary: '#f6392c', accent: '#351a19', accentForeground: '#ffd8d5' },
  { id: 'sunflower', name: 'Sunflower', primary: '#ffd248', accent: '#332b13', accentForeground: '#fff1ba' },
  { id: 'blue-hour', name: 'Blue Hour', primary: '#8297c9', accent: '#202638', accentForeground: '#e0e8ff' },
  { id: 'dusty-rose', name: 'Dusty Rose', primary: '#c5849c', accent: '#32202a', accentForeground: '#ffe0eb' },
  { id: 'sage', name: 'Sage', primary: '#80aa91', accent: '#1e2b23', accentForeground: '#d7f1e0' },
  { id: 'soft-lilac', name: 'Soft Lilac', primary: '#ad98cf', accent: '#292338', accentForeground: '#eee3ff' },
  { id: 'peach-fuzz', name: 'Peach Fuzz', primary: '#dba38e', accent: '#35251f', accentForeground: '#ffe5da' },
  { id: 'sea-glass', name: 'Sea Glass', primary: '#76b8b2', accent: '#182e2c', accentForeground: '#d4f6f1' },
  { id: 'periwinkle', name: 'Periwinkle', primary: '#9198d8', accent: '#22243b', accentForeground: '#e4e6ff' },
  { id: 'mocha', name: 'Mocha', primary: '#b99c88', accent: '#2e251f', accentForeground: '#f5e2d3' },
  { id: 'cherry-blossom', name: 'Cherry Blossom', primary: '#d695b3', accent: '#35212c', accentForeground: '#ffe0ee' },
  { id: 'arctic', name: 'Arctic', primary: '#8ebbd6', accent: '#1d2b35', accentForeground: '#dff3ff' },
  { id: 'apricot', name: 'Apricot', primary: '#dcb776', accent: '#332a1b', accentForeground: '#fff0d0' },
  { id: 'olive-mist', name: 'Olive Mist', primary: '#a6b780', accent: '#282f1d', accentForeground: '#edf5d7' },
] as const;

export type ThemeId = (typeof themePresets)[number]['id'];

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#f5f7fa',
    tint: '#6b5cb1',

    // Core surfaces
    background: '#000000',
    playbackOverlay: '#000000c9',
    foreground: '#f5f7fa',

    // Cards / elevated surfaces
    card: '#050607',
    cardForeground: '#f5f7fa',

    // Primary action color (buttons, links, active states)
    primary: '#6b5cb1',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#15121c',
    secondaryForeground: '#f5f7fa',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#1b1e23',
    mutedForeground: '#969da7',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#211b36',
    accentForeground: '#e4ddff',

    // Destructive actions (delete, error states)
    destructive: '#ff786e',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#1c2026',
    input: '#1c2026',
  },

  dark: {
    text: '#f5f7fa',
    tint: '#6b5cb1',
    background: '#000000',
    playbackOverlay: '#000000c9',
    foreground: '#f5f7fa',
    card: '#050607',
    cardForeground: '#f5f7fa',
    primary: '#6b5cb1',
    primaryForeground: '#ffffff',
    secondary: '#15121c',
    secondaryForeground: '#f5f7fa',
    muted: '#1b1e23',
    mutedForeground: '#969da7',
    accent: '#211b36',
    accentForeground: '#e4ddff',
    destructive: '#ff786e',
    destructiveForeground: '#ffffff',
    border: '#1c2026',
    input: '#1c2026',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

function foregroundFor(hex: string) {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

export function getThemeColors(themeId: ThemeId) {
  const preset = themePresets.find((theme) => theme.id === themeId) ?? themePresets[0];
  return {
    ...colors.dark,
    tint: preset.primary,
    primary: preset.primary,
    primaryForeground: foregroundFor(preset.primary),
    accent: preset.accent,
    accentForeground: preset.accentForeground,
  };
}

export default colors;
