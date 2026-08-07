import type { AuthSession } from '../../types/auth';
import { api } from './http';

export interface LoginPayload {
  tenantId: string;
  email: string;
  password: string;
}

interface BackendRouteError {
  message?: string | string[] | undefined;
}

function extractMessage(body: unknown, fallback: string): string {
  const err = body as BackendRouteError | null;
  if (!err?.message) return fallback;
  return Array.isArray(err.message) ? err.message.join(' ') : err.message;
}

// login/refreshSession/logout chamam as Route Handlers do PROPRIO Next.js
// (src/app/api/auth/*), nao a API real diretamente -- e ali que o refresh
// token e mantido em cookie httpOnly. Ja getMe consulta a API real (o
// unico endpoint de auth que e uma leitura autenticada comum).
export async function login(payload: LoginPayload): Promise<AuthSession> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractMessage(data, 'Não foi possível autenticar.'));
  }
  return data as AuthSession;
}

export async function refreshSession(): Promise<AuthSession | null> {
  const response = await fetch('/api/auth/refresh', { method: 'POST' });
  if (!response.ok) return null;
  return (await response.json()) as AuthSession;
}

export async function logout(accessToken: string | null): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  }).catch(() => undefined);
}

// GET /auth/me devolve o JwtPayload cru (sub/tenantId/role/email), NAO o
// AuthenticatedUser documentado no Swagger (que teria "name"/"id") --
// inconsistencia real do backend, documentada no relatorio final. Por isso
// esta rota nao e usada para hidratar o usuario exibido na UI (login/
// refresh ja devolvem o AuthenticatedUser completo em "user").
export interface RawJwtPayload {
  sub: string;
  tenantId: string | null;
  role: string;
  email: string;
}

export function getMe(): Promise<RawJwtPayload> {
  return api.get<RawJwtPayload>('/auth/me');
}
