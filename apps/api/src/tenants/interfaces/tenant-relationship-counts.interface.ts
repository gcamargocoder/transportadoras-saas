// Contagem de vinculos ativos (deletedAt = null quando aplicavel) usada
// para decidir se um tenant pode ser excluido (DELETE /tenants/:id).
export interface TenantRelationshipCounts {
  users: number;
  drivers: number;
  vehicles: number;
  trips: number;
}

export function hasAnyRelationship(counts: TenantRelationshipCounts): boolean {
  return counts.users > 0 || counts.drivers > 0 || counts.vehicles > 0 || counts.trips > 0;
}
