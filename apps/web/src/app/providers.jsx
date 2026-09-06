import { GoogleOAuthProvider } from '@react-oauth/google';
import { googleClientId, isGoogleConfigured } from '@/config/auth';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';

/**
 * Composed application providers.
 *
 * GoogleOAuthProvider only supplies the Google button/popup; our AuthProvider owns the actual
 * session. When Google is not configured we skip its provider entirely — the button falls back
 * to a disabled state and email auth is unaffected.
 *
 * ThemeProvider sits OUTSIDE the auth provider: the theme applies to signed-out screens too, and it
 * never calls the API. The account's saved theme is copied in by `ThemeSync` (RootLayout), which is
 * inside both.
 */
export function AppProviders({ children }) {
  const authed = <AuthProvider>{children}</AuthProvider>;

  return (
    <ThemeProvider>
      {isGoogleConfigured ? (
        <GoogleOAuthProvider clientId={googleClientId}>{authed}</GoogleOAuthProvider>
      ) : (
        authed
      )}
    </ThemeProvider>
  );
}
