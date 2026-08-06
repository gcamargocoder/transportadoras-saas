// Payload do JWT de refresh -- deliberadamente minimo (sem role/email) para
// que ele nao sirva como substituto de um access token mesmo se usado no
// lugar errado. `jti` identifica a linha correspondente em RefreshToken,
// usada para revogacao/rotacao.
export interface RefreshTokenPayload {
  sub: string; // user id
  jti: string; // RefreshToken.id
  iat?: number;
  exp?: number;
}
