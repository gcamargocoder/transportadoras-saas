export interface DriverRelationshipCounts {
  activeTrips: number;
}

export function hasActiveRelationship(counts: DriverRelationshipCounts): boolean {
  return counts.activeTrips > 0;
}
