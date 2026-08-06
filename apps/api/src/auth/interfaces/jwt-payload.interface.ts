// Formato do payload do JWT de acesso. Extraido automaticamente para
// `request.user` pela JwtAccessStrategy apos validar assinatura/expiracao,
// e e o que @CurrentUser() devolve nas rotas protegidas.
export interface JwtPayload {
  sub: string; // user id
  tenantId: string | null; // null apenas para Super Admin (acesso multi-empresa)
  role: string;
  email: string;
  iat?: number;
  exp?: number;
}
