'use client';

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
} from '../api/auth.api';
import type { LoginPayload } from '../api/auth.api';
import type { AuthenticatedUser } from '../../types/auth';
import { getAccessToken, setAccessToken, SESSION_EXPIRED_EVENT } from './token-store';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// Silencia a chamada a GET /auth/me: neste momento ela nao alimenta o
// estado de usuario (login/refresh ja devolvem o AuthenticatedUser
// completo), mas mantemos a integracao minima aqui para nao deixar o
// endpoint "morto" no cliente -- ver nota de inconsistencia em auth.api.ts.
void getMe;

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  useEffect(() => {
    let active = true;
    refreshSession()
      .then((session) => {
        if (!active) return;
        if (session) {
          setAccessToken(session.accessToken);
          setUser(session.user);
          setStatus('authenticated');
        } else {
          setStatus('unauthenticated');
        }
      })
      .catch(() => {
        if (active) setStatus('unauthenticated');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleSessionExpired() {
      setAccessToken(null);
      setUser(null);
      setStatus('unauthenticated');
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const session = await loginRequest(payload);
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest(getAccessToken());
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
