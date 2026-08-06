// Contrato de uma entrada de auditoria. Espelha os campos do model AuditLog
// (packages/database/prisma/schema.prisma) -- ja cobre usuario, acao,
// entidade, valores anterior/novo, IP e User-Agent (mapeado para
// deviceInfo, unico campo com nome diferente no schema).
export interface AuditLogEntry {
  tenantId: string;
  userId: string | null;
  action: string; // ex: "tenant.created", "user.status_changed"
  entityName: string; // ex: "Tenant", "UserAccount"
  entityId: string;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}
