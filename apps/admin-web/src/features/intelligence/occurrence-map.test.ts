import { describe, expect, it } from 'vitest';
import { clusterOccurrencePoints, type OccurrenceMapPoint } from './occurrence-map';

function point(overrides: Partial<OccurrenceMapPoint> = {}): OccurrenceMapPoint {
  return {
    id: 'x',
    latitude: -23.5505,
    longitude: -46.6333,
    severity: 'INFO',
    description: null,
    locationLabel: null,
    vehicleId: null,
    tripId: null,
    ...overrides,
  };
}

describe('clusterOccurrencePoints (BI 8 -- agrupamento por grade, sem estimar posicao)', () => {
  it('agrupa pontos na mesma celula (~1km) num unico cluster', () => {
    const clusters = clusterOccurrencePoints([
      point({ id: 'a', latitude: -23.5505, longitude: -46.6333 }),
      point({ id: 'b', latitude: -23.5506, longitude: -46.6334 }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.points).toHaveLength(2);
  });

  it('mantem clusters separados para pontos distantes (nunca funde posicoes diferentes)', () => {
    const clusters = clusterOccurrencePoints([point({ id: 'a', latitude: -23.55, longitude: -46.63 }), point({ id: 'b', latitude: -3.11, longitude: -60.02 })]);
    expect(clusters).toHaveLength(2);
  });

  it('lista vazia => nenhum cluster (nunca um ponto inventado)', () => {
    expect(clusterOccurrencePoints([])).toEqual([]);
  });
});
