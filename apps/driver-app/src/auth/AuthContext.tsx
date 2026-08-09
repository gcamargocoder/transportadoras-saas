import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/auth.api';
import { onSessionExpired, setAccessTokenCache } from '../api/http';
import { clearSession, loadSession, saveSession } from '../storage/secureStore';

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  driverName: string | null;
  login: (input: { tenantId: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Sessao do motorista (Fase 25) -- ao abrir o app, tenta recuperar a sessao
// persistida (SecureStore) antes de mostrar a tela de login. Fechar o app
// nunca desloga o motorista nem encerra a viagem (isso e responsabilidade
// separada do backend, ver GET /driver/trips/active).
export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [driverName, setDriverName] = useState<string | null>(null);

  useEffect(() => {
    onSessionExpired(() => {
      setIsAuthenticated(false);
      setDriverName(null);
    });

    (async () => {
      const session = await loadSession();
      if (session) {
        setAccessTokenCache(session.accessToken);
        setIsAuthenticated(true);
      }
      setIsLoading(false);
    })();

    return () => onSessionExpired(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      isLoading,
      isAuthenticated,
      driverName,
      login: async (input) => {
        const tokens = await authApi.login(input);
        await saveSession({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tenantId: input.tenantId,
        });
        setAccessTokenCache(tokens.accessToken);
        setDriverName(tokens.user.name);
        setIsAuthenticated(true);
      },
      logout: async () => {
        const session = await loadSession();
        if (session) {
          await authApi.logout(session.refreshToken).catch(() => undefined);
        }
        await clearSession();
        setAccessTokenCache(null);
        setIsAuthenticated(false);
        setDriverName(null);
      },
    }),
    [isLoading, isAuthenticated, driverName],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider.');
  return ctx;
}
