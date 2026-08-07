import { NextResponse } from 'next/server';
import { API_HOST } from '../../../../lib/api/config';
import { REFRESH_COOKIE_MAX_AGE_SECONDS, REFRESH_COOKIE_NAME } from '../../../../lib/auth/cookies';

interface BackendLoginSuccess {
  success: true;
  data: {
    accessToken: string;
    refreshToken: string;
    tokenType: 'Bearer';
    expiresIn: string;
    user: { id: string; email: string; name: string; role: string; tenantId: string };
  };
}

// Proxy fino para POST /auth/login: o refreshToken NUNCA chega ao JS do
// navegador (fica so num cookie httpOnly), reduzindo a superficie de roubo
// via XSS. O accessToken (curta duracao) volta no corpo da resposta para o
// cliente guardar em memoria.
export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ message: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const backendResponse = await fetch(`${API_HOST}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload: unknown = await backendResponse.json().catch(() => null);

  if (!backendResponse.ok || !(payload as { success?: boolean } | null)?.success) {
    return NextResponse.json(payload ?? { message: 'Não foi possível autenticar.' }, {
      status: backendResponse.status,
    });
  }

  const { accessToken, refreshToken, expiresIn, user } = (payload as BackendLoginSuccess).data;

  const response = NextResponse.json({ accessToken, expiresIn, user });
  response.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
