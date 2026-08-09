import { apiRequest } from './http';

export interface LoginPayload {
  tenantId: string;
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: { id: string; name: string; email: string; role: string; tenantId: string | null };
}

export function login(payload: LoginPayload): Promise<AuthTokens> {
  return apiRequest<AuthTokens>('/auth/login', { method: 'POST', body: payload });
}

export function logout(refreshToken: string): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST', body: { refreshToken } });
}
