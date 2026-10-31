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

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#f5f7fa',
    tint: '#6b5cb1',

    // Core surfaces
    background: '#000000',
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

export default colors;
