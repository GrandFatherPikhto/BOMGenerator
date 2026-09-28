import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api } from './lib/apiClient.js';

const AuthContext = createContext({
  ready: false,
  authEnabled: false,
  username: null,
  login: async () => {},
  logout: async () => {},
});

/**
 * Who is signed in. Loaded once from `/api/auth/me`, which always answers `200`
 * so the app can tell "authentication is off" from "sign in, please".
 *
 * A `401` from any request (`apiClient` re-emits it as `bom:unauthorized`)
 * drops the session here, and the root then shows the login screen again.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ ready: false, authEnabled: false, username: null });

  useEffect(() => {
    let cancelled = false;
    api.auth
      .me()
      .then((data) => {
        if (!cancelled) {
          setState({
            ready: true,
            authEnabled: Boolean(data?.authEnabled),
            username: data?.username ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ ready: true, authEnabled: false, username: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setState((previous) =>
        previous.username === null ? previous : { ...previous, username: null },
      );
    };
    window.addEventListener('bom:unauthorized', onUnauthorized);
    return () => window.removeEventListener('bom:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.auth.login(username, password);
    setState({ ready: true, authEnabled: true, username: data?.username ?? username });
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Even if the request fails the local session is over.
    }
    setState((previous) => ({ ...previous, username: null }));
  }, []);

  const value = useMemo(
    () => ({ ...state, login, logout }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
