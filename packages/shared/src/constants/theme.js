/**
 * Appearance — the colour theme a person reads the product in.
 *
 * Stored on the account (`users.themePreference`) so it follows them across devices, and mirrored
 * in the browser so the very first paint is already the right colour. `system` defers to the
 * device's own light/dark setting and is the default: nobody's screen changes because we shipped a
 * feature.
 */
export const THEME_PREFERENCES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
});

export const THEME_PREFERENCE_VALUES = Object.freeze(Object.values(THEME_PREFERENCES));
