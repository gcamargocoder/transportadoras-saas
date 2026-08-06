import { Request } from 'express';

export interface RequestMetadata {
  userAgent: string | null;
  ipAddress: string | null;
}

// Extrai metadados de auditoria da sessao (RefreshToken.userAgent/ipAddress)
// -- nao afeta a decisao de autenticar, e apenas contexto para o usuario
// conseguir identificar/revogar sessoes no futuro (ex: "Chrome - Windows").
export function extractRequestMetadata(request: Request): RequestMetadata {
  return {
    userAgent: request.headers['user-agent'] ?? null,
    ipAddress: request.ip ?? null,
  };
}
