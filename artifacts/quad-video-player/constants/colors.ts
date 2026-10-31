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
    text: '#f4f7fb',
    tint: '#5de0c5',

    // Core surfaces
    background: '#090d12',
    foreground: '#f4f7fb',

    // Cards / elevated surfaces
    card: '#111821',
    cardForeground: '#f4f7fb',

    // Primary action color (buttons, links, active states)
    primary: '#5de0c5',
    primaryForeground: '#07120f',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#202b37',
    secondaryForeground: '#f4f7fb',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#293544',
    mutedForeground: '#91a0b1',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#173e3a',
    accentForeground: '#c8fff2',

    // Destructive actions (delete, error states)
    destructive: '#ff786e',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#293543',
    input: '#293543',
  },

  dark: {
    text: '#f4f7fb',
    tint: '#5de0c5',
    background: '#090d12',
    foreground: '#f4f7fb',
    card: '#111821',
    cardForeground: '#f4f7fb',
    primary: '#5de0c5',
    primaryForeground: '#07120f',
    secondary: '#202b37',
    secondaryForeground: '#f4f7fb',
    muted: '#293544',
    mutedForeground: '#91a0b1',
    accent: '#173e3a',
    accentForeground: '#c8fff2',
    destructive: '#ff786e',
    destructiveForeground: '#ffffff',
    border: '#293543',
    input: '#293543',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
