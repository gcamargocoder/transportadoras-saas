import { discoverTollsAlongRoute, TollPlazaCandidate } from './toll-matching.util';

// Reta densa ao longo do equador: 0.001 grau de longitude ~ 111m entre
// vertices (aproxima a densidade real de uma polyline de rodovia) -- com
// essa densidade, a aproximacao por vertice mais proximo (ver
// route-geometry.util.ts) fica bem dentro de tolerancias de poucas centenas
// de metros, que e o caso de uso real desta fase.
const ROUTE = Array.from({ length: 41 }, (_, i) => ({ latitude: 0, longitude: i * 0.001 }));

function plaza(overrides: Partial<TollPlazaCandidate> & { id: string }): TollPlazaCandidate {
  return { name: 'Praca', latitude: 0, longitude: 0, pricePerAxle: 10, ...overrides };
}

describe('toll-matching.util', () => {
  describe('discoverTollsAlongRoute', () => {
    it('descobre e ordena pracas por distancia da origem, mesmo fora de ordem de entrada', () => {
      const candidates = [
        plaza({ id: 'far', longitude: 0.035 }),
        plaza({ id: 'near', longitude: 0.005 }),
        plaza({ id: 'mid', longitude: 0.02 }),
      ];

      const result = discoverTollsAlongRoute(ROUTE, candidates, 200);

      expect(result.map((r) => r.tollPlazaId)).toEqual(['near', 'mid', 'far']);
      expect(result.map((r) => r.sequence)).toEqual([1, 2, 3]);
      expect(result[0]!.distanceFromOriginMeters).toBeLessThan(result[1]!.distanceFromOriginMeters);
      expect(result[1]!.distanceFromOriginMeters).toBeLessThan(result[2]!.distanceFromOriginMeters);
    });

    it('ignora pracas fora da tolerancia configurada', () => {
      const candidates = [
        plaza({ id: 'on-route', latitude: 0, longitude: 0.01 }),
        plaza({ id: 'far-away', latitude: 5, longitude: 5 }),
      ];

      const result = discoverTollsAlongRoute(ROUTE, candidates, 200);

      expect(result).toHaveLength(1);
      expect(result[0]!.tollPlazaId).toBe('on-route');
    });

    it('praca exatamente sobre a rota tem confianca maxima (1)', () => {
      const result = discoverTollsAlongRoute(ROUTE, [plaza({ id: 'exact', longitude: 0.02 })], 200);
      expect(result[0]!.matchConfidence).toBe(1);
    });

    it('retorna vazio quando nao ha candidatos ou rota vazia', () => {
      expect(discoverTollsAlongRoute(ROUTE, [], 200)).toEqual([]);
      expect(discoverTollsAlongRoute([], [plaza({ id: 'a' })], 200)).toEqual([]);
    });

    it('nunca duplica a mesma praca (uma linha por candidato dentro da tolerancia)', () => {
      const candidates = [plaza({ id: 'only', longitude: 0.02 })];
      const result = discoverTollsAlongRoute(ROUTE, candidates, 200);
      expect(result).toHaveLength(1);
    });
  });
});
