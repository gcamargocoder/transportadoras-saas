import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_HOST } from '../../../../lib/api/config';
import { REFRESH_COOKIE_NAME } from '../../../../lib/auth/cookies';

// Logout e sempre idempotente do ponto de vista do cliente: mesmo se a
// chamada ao backend falhar (token ja expirado etc.), o cookie local e
// removido e a resposta e sempre 200 -- o usuario nunca fica "preso"
// logado na UI por causa de um erro de rede no logout.
export async function POST(request: Request): Promise<Response> {
  const refreshToken = cookies().get(REFRESH_COOKIE_NAME)?.value;
  const authHeader = request.headers.get('authorization');

  if (refreshToken && authHeader) {
    await fetch(`${API_HOST}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete(REFRESH_COOKIE_NAME);
  return response;
}
