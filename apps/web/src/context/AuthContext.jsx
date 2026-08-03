import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  bootstrapSession,
  login as apiLogin,
  signup as apiSignup,
  googleLogin as apiGoogleLogin,
  logout as apiLogout,
} from '@/services/auth.api';
import { fetchCurrentUser } from '@/services/users.api';
import { registerAuthHandlers, clearAccessToken } from '@/services/apiClient';

const AuthContext = createContext(null);

/**
 * Our own session, backed entirely by the Express auth API.
 *
 * On boot it attempts a silent refresh (the httpOnly cookie survives a page reload), then loads
 * the full user + capabilities. `capabilities` is always derived server-side from CandidateProfile
 * and CompanyMember — there is no role on the user.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous
  const [error, setError] = useState(null);

  const loadMe = useCallback(async () => {
    const data = await fetchCurrentUser();
    setUser(data.user);
    setCapabilities(data.capabilities);
    return data;
  }, []);

  const applyAuthedUser = useCallback(
    async (basicUser) => {
      setUser(basicUser);
      setStatus('authenticated');
      // Fetch capabilities (companies, candidate profile) right after establishing the session.
      try {
        await loadMe();
      } catch {
        // Keep the session even if the capabilities fetch hiccups; it retries on next use.
      }
    },
    [loadMe],
  );

  // Silent sign-in on boot.
  useEffect(() => {
    let cancelled = false;

    bootstrapSession()
      .then(async (sessionUser) => {
        if (cancelled) return;
        if (sessionUser) {
          await applyAuthedUser(sessionUser);
        } else {
          setStatus('anonymous');
        }
      })
      .catch(() => !cancelled && setStatus('anonymous'));

    return () => {
      cancelled = true;
    };
  }, [applyAuthedUser]);

  // When the API client gives up refreshing, drop to anonymous.
  useEffect(() => {
    registerAuthHandlers({
      onCleared: () => {
        setUser(null);
        setCapabilities(null);
        setStatus('anonymous');
      },
    });
  }, []);

  /**
   * Sign up. Deliberately does NOT establish a session — the account must verify its email and
   * then sign in. Returns { user, emailVerificationRequired } for the caller to route to the
   * Verification Sent screen.
   */
  const signup = useCallback(async (input) => {
    setError(null);
    return apiSignup(input);
  }, []);

  const login = useCallback(
    async (input) => {
      setError(null);
      const authedUser = await apiLogin(input);
      await applyAuthedUser(authedUser);
      return authedUser;
    },
    [applyAuthedUser],
  );

  const loginWithGoogle = useCallback(
    async (credential) => {
      setError(null);
      const authedUser = await apiGoogleLogin(credential);
      await applyAuthedUser(authedUser);
      return authedUser;
    },
    [applyAuthedUser],
  );

  /**
   * Adopt a session established outside the login/signup paths — currently AUTH-03 set-password,
   * which authenticates the user as part of onboarding (PRD §6.1).
   */
  const adoptSession = useCallback(
    async (authedUser) => {
      setError(null);
      await applyAuthedUser(authedUser);
      return authedUser;
    },
    [applyAuthedUser],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    clearAccessToken();
    setUser(null);
    setCapabilities(null);
    setStatus('anonymous');
  }, []);

  const refresh = useCallback(() => loadMe(), [loadMe]);

  const value = useMemo(
    () => ({
      user,
      capabilities,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      error,
      signup,
      login,
      loginWithGoogle,
      adoptSession,
      logout,
      // Alias so existing callers (UserMenu, AppHomePage) keep working.
      signOut: logout,
      refresh,
    }),
    [user, capabilities, status, error, signup, login, loginWithGoogle, adoptSession, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
