export interface VehicleRelationshipCounts {
  activeTrips: number;
  activeCompositions: number;
}

export function hasActiveRelationship(counts: VehicleRelationshipCounts): boolean {
  return counts.activeTrips > 0 || counts.activeCompositions > 0;
}
