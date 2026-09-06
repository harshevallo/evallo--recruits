import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { THEME_PREFERENCES, THEME_PREFERENCE_VALUES } from '@evallo/shared';
import { useAuth } from './AuthContext';

/**
 * Same key and resolution rule as the inline script in `index.html`, which paints the theme before
 * React mounts. Change both together.
 */
export const THEME_STORAGE_KEY = 'evallo.theme';

const ThemeContext = createContext(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStoredPreference() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_PREFERENCE_VALUES.includes(stored) ? stored : THEME_PREFERENCES.SYSTEM;
  } catch {
    return THEME_PREFERENCES.SYSTEM;
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches;
}

/**
 * The colour theme — light, dark, or follow the device.
 *
 * ── How it works ──────────────────────────────────────────────────────────────────────────────
 *
 * The whole palette is CSS variables (`styles/index.css`) switched by one class, `dark`, on
 * `<html>`. This provider owns that class. It holds the PREFERENCE (what the person asked for) and
 * derives the RESOLVED theme (what is painted): `system` follows `prefers-color-scheme` live, so a
 * device that switches to dark at sunset takes the app with it.
 *
 * The preference lives in two places on purpose:
 *
 *   · `localStorage`, so the inline script in `index.html` can paint the right colour before the
 *     bundle arrives, and so a signed-out visitor's choice survives a reload.
 *   · the ACCOUNT (`users.themePreference`), so it follows a person across devices. `ThemeSync`
 *     below copies the account value into this provider whenever a session is established.
 *
 * Saving to the account is the Settings screen's job, not this provider's — this file never calls
 * the API, so it can sit outside the router and above the auth provider without a cycle.
 */
export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  /* Follow the device while the preference is `system`. */
  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) return undefined;
    const onChange = (event) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved =
    preference === THEME_PREFERENCES.SYSTEM
      ? systemDark
        ? THEME_PREFERENCES.DARK
        : THEME_PREFERENCES.LIGHT
      : preference;

  /* The one place the class is written. `color-scheme` follows so native controls match. */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === THEME_PREFERENCES.DARK);
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setPreference = useCallback((value) => {
    const next = THEME_PREFERENCE_VALUES.includes(value) ? value : THEME_PREFERENCES.SYSTEM;
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* Storage blocked: the choice still applies for this page load. */
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}

/**
 * Copies the signed-in account's theme into the provider.
 *
 * Rendered once, inside both providers (RootLayout). The account is the source of truth once there
 * is a session: someone who chose dark on their laptop opens their phone and gets dark. It only ever
 * writes when the account value CHANGES, so a choice made on this device a moment ago is not undone
 * by a stale `/me` response arriving late.
 */
export function ThemeSync() {
  const { isAuthenticated, user } = useAuth();
  const { setPreference } = useTheme();
  const accountPreference = user?.themePreference;

  useEffect(() => {
    if (!isAuthenticated || !accountPreference) return;
    setPreference(accountPreference);
  }, [isAuthenticated, accountPreference, setPreference]);

  return null;
}
