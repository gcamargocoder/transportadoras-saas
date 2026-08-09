import { decodePolyline } from './polyline.util';

describe('polyline.util', () => {
  describe('decodePolyline', () => {
    // Exemplo oficial da documentacao do Google:
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    it('decodifica o exemplo oficial do algoritmo do Google', () => {
      const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');

      expect(points).toHaveLength(3);
      expect(points[0]!.latitude).toBeCloseTo(38.5, 5);
      expect(points[0]!.longitude).toBeCloseTo(-120.2, 5);
      expect(points[1]!.latitude).toBeCloseTo(40.7, 5);
      expect(points[1]!.longitude).toBeCloseTo(-120.95, 5);
      expect(points[2]!.latitude).toBeCloseTo(43.252, 5);
      expect(points[2]!.longitude).toBeCloseTo(-126.453, 5);
    });

    it('retorna array vazio para string vazia', () => {
      expect(decodePolyline('')).toEqual([]);
    });
  });
});
