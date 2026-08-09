import { haversineDistanceMeters } from './geo.util';

describe('geo.util', () => {
  describe('haversineDistanceMeters', () => {
    it('retorna 0 para o mesmo ponto', () => {
      const point = { latitude: -23.5505, longitude: -46.6333 };
      expect(haversineDistanceMeters(point, point)).toBe(0);
    });

    it('calcula a distancia aproximada entre Sao Paulo e Rio de Janeiro (~360km)', () => {
      const saoPaulo = { latitude: -23.5505, longitude: -46.6333 };
      const rioDeJaneiro = { latitude: -22.9068, longitude: -43.1729 };

      const distance = haversineDistanceMeters(saoPaulo, rioDeJaneiro);

      expect(distance).toBeGreaterThan(350_000);
      expect(distance).toBeLessThan(370_000);
    });

    it('calcula distancias curtas (metros) com precisao razoavel', () => {
      // ~0.001 grau de latitude equivale a aproximadamente 111 metros.
      const a = { latitude: -23.5505, longitude: -46.6333 };
      const b = { latitude: -23.5515, longitude: -46.6333 };

      const distance = haversineDistanceMeters(a, b);

      expect(distance).toBeGreaterThan(100);
      expect(distance).toBeLessThan(120);
    });

    it('e simetrica (distancia de A para B = distancia de B para A)', () => {
      const a = { latitude: -23.5505, longitude: -46.6333 };
      const b = { latitude: -22.9068, longitude: -43.1729 };

      expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 6);
    });
  });
});
