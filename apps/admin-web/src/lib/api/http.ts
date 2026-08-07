import { emitSessionExpired, getAccessToken, setAccessToken } from '../auth/token-store';
import type { ApiErrorResponse, ApiSuccessResponse, QueryValue } from '../../types/api';
import { API_BASE_URL } from './config';
import { ApiError } from './errors';

export type { QueryValue };

interface RequestOptions {
  method?: string | undefined;
  body?: unknown | undefined;
  query?: Record<string, QueryValue> | undefined;
  isForm?: boolean | undefined;
  signal?: AbortSignal | undefined;
  skipAuthRetry?: boolean | undefined;
}

// Evita disparar N refreshes em paralelo quando varias requisicoes recebem
// 401 ao mesmo tempo (ex: dashboard com Promise.all de varios endpoints) --
// todas aguardam a MESMA promise de refresh em andamento.
let refreshPromise: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
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

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, isForm, signal, skipAuthRetry } = options;

  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let requestBody: BodyInit | undefined;
  if (body !== undefined) {
    if (isForm && body instanceof FormData) {
      requestBody = body;
    } else {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }
  }

  const init: RequestInit = { method, headers };
  if (requestBody !== undefined) init.body = requestBody;
  if (signal) init.signal = signal;

  const response = await fetch(buildUrl(path, query), init);

  if (response.status === 204) {
    return undefined as T;
  }

  const json: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !skipAuthRetry) {
      const refreshed = await performRefresh();
      if (refreshed) {
        return apiFetch<T>(path, { ...options, skipAuthRetry: true });
      }
      emitSessionExpired();
    }

    const errorBody = json as ApiErrorResponse | null;
    throw new ApiError(
      response.status,
      errorBody?.error ?? 'Error',
      errorBody?.message ?? 'Erro inesperado.',
      errorBody?.path ?? path,
    );
  }

  const success = json as ApiSuccessResponse<T>;
  return success.data;
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) =>
    apiFetch<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown, options?: Partial<RequestOptions>) =>
    apiFetch<T>(path, { method: 'POST', body, ...options }),
  patch: <T>(path: string, body?: unknown, options?: Partial<RequestOptions>) =>
    apiFetch<T>(path, { method: 'PATCH', body, ...options }),
  put: <T>(path: string, body?: unknown, options?: Partial<RequestOptions>) =>
    apiFetch<T>(path, { method: 'PUT', body, ...options }),
  delete: <T>(path: string, options?: Partial<RequestOptions>) =>
    apiFetch<T>(path, { method: 'DELETE', ...options }),
};
