import { GoogleOAuthProvider } from '@react-oauth/google';
import { googleClientId, isGoogleConfigured } from '@/config/auth';
import { AuthProvider } from '@/context/AuthContext';

/**
 * Composed application providers.
 *
 * GoogleOAuthProvider only supplies the Google button/popup; our AuthProvider owns the actual
 * session. When Google is not configured we skip its provider entirely — the button falls back
 * to a disabled state and email auth is unaffected.
 */
export function AppProviders({ children }) {
  if (isGoogleConfigured) {
    return (
      <GoogleOAuthProvider clientId={googleClientId}>
        <AuthProvider>{children}</AuthProvider>
      </GoogleOAuthProvider>
    );
  }

  return <AuthProvider>{children}</AuthProvider>;
}
