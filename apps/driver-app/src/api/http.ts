import { clearSession, loadSession, updateAccessToken } from '../storage/secureStore';
import { API_BASE_URL } from './config';
import { ApiError, ApiErrorResponse, ApiSuccessResponse } from './types';

// Access token em memoria (evita ler o SecureStore a cada requisicao) --
// sempre inicializado a partir da sessao persistida no boot do app (ver
// AuthContext). null = nao autenticado.
let accessTokenCache: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function setAccessTokenCache(token: string | null): void {
  accessTokenCache = token;
}

// Chamado pelo AuthContext para reagir a uma sessao definitivamente expirada
// (refresh token tambem invalido) -- devolve o app para a tela de login.
export function onSessionExpired(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

let refreshPromise: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const session = await loadSession();
      if (!session) return false;
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
        if (!res.ok) return false;
        const json = (await res.json()) as ApiSuccessResponse<{ accessToken: string }>;
        accessTokenCache = json.data.accessToken;
        await updateAccessToken(json.data.accessToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  skipAuthRetry?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

// Cliente HTTP minimo (sem lib externa) -- unico ponto que sabe do envelope
// {success,data} e do fluxo de refresh automatico em 401.
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, skipAuthRetry } = options;

  const headers: Record<string, string> = {};
  if (accessTokenCache) headers.Authorization = `Bearer ${accessTokenCache}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !skipAuthRetry) {
      const refreshed = await performRefresh();
      if (refreshed) {
        return apiRequest<T>(path, { ...options, skipAuthRetry: true });
      }
      await clearSession();
      accessTokenCache = null;
      sessionExpiredHandler?.();
    }
    throw new ApiError(response.status, json as ApiErrorResponse | null);
  }

  return (json as ApiSuccessResponse<T>).data;
}
