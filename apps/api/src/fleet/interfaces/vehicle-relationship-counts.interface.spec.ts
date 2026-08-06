import {
  hasActiveRelationship,
  VehicleRelationshipCounts,
} from './vehicle-relationship-counts.interface';

describe('hasActiveRelationship (vehicle)', () => {
  const empty: VehicleRelationshipCounts = { activeTrips: 0, activeCompositions: 0 };

  it('retorna false quando nao ha viagens em andamento nem composicoes ativas', () => {
    expect(hasActiveRelationship(empty)).toBe(false);
  });

  it('retorna true quando ha viagem em andamento', () => {
    expect(hasActiveRelationship({ ...empty, activeTrips: 1 })).toBe(true);
  });

  it('retorna true quando ha composicao ativa', () => {
    expect(hasActiveRelationship({ ...empty, activeCompositions: 1 })).toBe(true);
  });
});
