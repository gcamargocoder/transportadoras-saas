// Quem esta executando a acao (para AuditLog.userId) -- sempre o usuario
// autenticado que chamou o endpoint, nunca a entidade sendo modificada.
// Compartilhado entre todos os modulos de negocio (Users, Tenants, Drivers,
// ...) para nao duplicar essa mesma forma em cada um.
export interface AuditActor {
  userId: string;
}
