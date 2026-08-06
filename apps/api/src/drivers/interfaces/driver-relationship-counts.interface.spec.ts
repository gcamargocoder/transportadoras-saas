import {
  DriverRelationshipCounts,
  hasActiveRelationship,
} from './driver-relationship-counts.interface';

describe('hasActiveRelationship', () => {
  it('retorna false quando nao ha viagens ativas', () => {
    const counts: DriverRelationshipCounts = { activeTrips: 0 };
    expect(hasActiveRelationship(counts)).toBe(false);
  });

  it('retorna true quando ha ao menos uma viagem ativa', () => {
    const counts: DriverRelationshipCounts = { activeTrips: 1 };
    expect(hasActiveRelationship(counts)).toBe(true);
  });
});
