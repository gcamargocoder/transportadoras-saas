import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_HOST } from '../../../../lib/api/config';
import { REFRESH_COOKIE_MAX_AGE_SECONDS, REFRESH_COOKIE_NAME } from '../../../../lib/auth/cookies';

interface BackendRefreshSuccess {
  success: true;
  data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    user: { id: string; email: string; name: string; role: string; tenantId: string };
  };
}

// Le o refresh token do cookie httpOnly (inacessivel ao JS do navegador),
// troca por um novo par de tokens no backend (rotacao) e substitui o
// cookie. Usado tanto na recuperacao de sessao (carregamento inicial da
// app) quanto pelo interceptor de 401 do cliente HTTP.
export async function POST(): Promise<Response> {
  const refreshToken = cookies().get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) {
    return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 401 });
  }

  const backendResponse = await fetch(`${API_HOST}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const payload: unknown = await backendResponse.json().catch(() => null);

  if (!backendResponse.ok || !(payload as { success?: boolean } | null)?.success) {
    const response = NextResponse.json(payload ?? { message: 'Sessão expirada.' }, {
      status: backendResponse.status,
    });
    response.cookies.delete(REFRESH_COOKIE_NAME);
    return response;
  }

  const {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn,
    user,
  } = (payload as BackendRefreshSuccess).data;

  const response = NextResponse.json({ accessToken, expiresIn, user });
  response.cookies.set(REFRESH_COOKIE_NAME, newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
