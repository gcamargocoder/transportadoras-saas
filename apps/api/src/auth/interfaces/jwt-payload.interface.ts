// Formato do payload do JWT de acesso. Extraido automaticamente para
// `request.user` pela JwtAccessStrategy apos validar assinatura/expiracao,
// e e o que @CurrentUser() devolve nas rotas protegidas.
export interface JwtPayload {
  sub: string; // user id
  // SEMPRE preenchido, inclusive para SUPER_ADMIN -- UserAccount.tenantId
  // e obrigatorio no schema, nao ha usuario "sem tenant" hoje. O acesso
  // administrativo cross-tenant (Fase 47, GET /tenants etc.) nao depende
  // de tenantId=null: e resolvido por role (SUPER_ADMIN) + TenantGuard
  // deixando de bloquear por isActive=false especificamente para esse
  // role, nunca por este campo virar null.
  tenantId: string;
  role: string;
  email: string;
  iat?: number;
  exp?: number;
}
