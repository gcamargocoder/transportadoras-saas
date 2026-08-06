export interface VehicleRelationshipCounts {
  activeTrips: number;
  activeCompositions: number;
  openMaintenances: number;
}

export function hasActiveRelationship(counts: VehicleRelationshipCounts): boolean {
  return counts.activeTrips > 0 || counts.activeCompositions > 0 || counts.openMaintenances > 0;
}
