import {
  computeBoundingBox,
  cumulativeDistancesMeters,
  distanceFromOriginMeters,
  distanceToPolylineMeters,
  isWithinBoundingBox,
  nearestPointOnPolyline,
} from './route-geometry.util';

// Reta simples ao longo do equador -- cada 0.001 grau de longitude no
// equador equivale a aproximadamente 111 metros -- facilita contas exatas.
const STRAIGHT_LINE = [
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 0.01 },
  { latitude: 0, longitude: 0.02 },
  { latitude: 0, longitude: 0.03 },
];

describe('route-geometry.util', () => {
  describe('nearestPointOnPolyline / distanceToPolylineMeters', () => {
    it('encontra o vertice mais proximo e a distancia ate ele', () => {
      const point = { latitude: 0.0005, longitude: 0.01 };
      const result = nearestPointOnPolyline(point, STRAIGHT_LINE);
      expect(result.index).toBe(1);
      expect(result.distanceMeters).toBeGreaterThan(0);
      expect(result.distanceMeters).toBeLessThan(100);
    });

    it('retorna Infinity para polyline vazia', () => {
      expect(distanceToPolylineMeters({ latitude: 0, longitude: 0 }, [])).toBe(Infinity);
    });

    it('distancia zero quando o ponto coincide com um vertice', () => {
      expect(distanceToPolylineMeters({ latitude: 0, longitude: 0.02 }, STRAIGHT_LINE)).toBe(0);
    });
  });

  describe('cumulativeDistancesMeters', () => {
    it('comeca em zero e cresce monotonicamente', () => {
      const cumulative = cumulativeDistancesMeters(STRAIGHT_LINE);
      expect(cumulative[0]).toBe(0);
      expect(cumulative).toHaveLength(STRAIGHT_LINE.length);
      for (let i = 1; i < cumulative.length; i += 1) {
        expect(cumulative[i]!).toBeGreaterThan(cumulative[i - 1]!);
      }
      // ~1110m por 0.01 grau de longitude no equador, 3 segmentos.
      expect(cumulative[3]!).toBeGreaterThan(3000);
      expect(cumulative[3]!).toBeLessThan(3500);
    });
  });

  describe('distanceFromOriginMeters', () => {
    it('cresce conforme o ponto se aproxima do fim da rota', () => {
      const cumulative = cumulativeDistancesMeters(STRAIGHT_LINE);
      const near = distanceFromOriginMeters({ latitude: 0, longitude: 0.01 }, STRAIGHT_LINE, cumulative);
      const far = distanceFromOriginMeters({ latitude: 0, longitude: 0.03 }, STRAIGHT_LINE, cumulative);
      expect(far).toBeGreaterThan(near);
    });
  });

  describe('computeBoundingBox / isWithinBoundingBox', () => {
    it('retorna null para polyline vazia', () => {
      expect(computeBoundingBox([], 100)).toBeNull();
    });

    it('inclui pontos dentro da rota + margem, exclui pontos muito distantes', () => {
      const box = computeBoundingBox(STRAIGHT_LINE, 500);
      expect(box).not.toBeNull();
      expect(isWithinBoundingBox({ latitude: 0, longitude: 0.015 }, box!)).toBe(true);
      expect(isWithinBoundingBox({ latitude: 10, longitude: 10 }, box!)).toBe(false);
    });
  });
});
