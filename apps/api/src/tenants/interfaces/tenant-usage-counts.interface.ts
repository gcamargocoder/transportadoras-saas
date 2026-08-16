// Fase 47 -- GET /tenants/:id/usage. Distinto de TenantRelationshipCounts
// (guarda de exclusao, escopo minimo) -- visao completa de utilizacao real
// do tenant.
export interface TenantUsageCounts {
  users: number;
  drivers: number;
  vehicles: number;
  trips: number;
  checklistExecutions: number;
  fuelSupplies: number;
  maintenances: number;
  attachments: number;
  // Fase 48 -- soma real de sizeBytes (Attachment + ImportJob) convertida
  // para MB, arredondada para 2 casas. Uploads anteriores a esta fase (sem
  // sizeBytes gravado) ficam de fora, nunca estimados.
  storageUsedMb: number;
}
