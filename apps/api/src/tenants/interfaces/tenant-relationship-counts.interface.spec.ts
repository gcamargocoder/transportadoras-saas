import {
  hasAnyRelationship,
  TenantRelationshipCounts,
} from './tenant-relationship-counts.interface';

describe('hasAnyRelationship', () => {
  const empty: TenantRelationshipCounts = { users: 0, drivers: 0, vehicles: 0, trips: 0 };

  it('retorna false quando todas as contagens sao zero', () => {
    expect(hasAnyRelationship(empty)).toBe(false);
  });

  it.each([
    ['users', { ...empty, users: 1 }],
    ['drivers', { ...empty, drivers: 1 }],
    ['vehicles', { ...empty, vehicles: 1 }],
    ['trips', { ...empty, trips: 1 }],
  ])('retorna true quando %s > 0', (_label, counts) => {
    expect(hasAnyRelationship(counts as TenantRelationshipCounts)).toBe(true);
  });
});
