import {
  googleMoneyToNumber,
  parseGoogleDurationSeconds,
  parseGoogleRoutesResponse,
} from './google-route-parser.util';
import { CalculateRouteInput } from './routing-provider.interface';

const INPUT: CalculateRouteInput = {
  origin: { label: 'Catanduva/SP' },
  destination: { label: 'Sao Paulo/SP' },
  computeAlternatives: false,
};

// Fixture com o exemplo oficial de encoded polyline do Google (decodifica
// para 3 pontos conhecidos, ver polyline.util.spec.ts).
const ENCODED_POLYLINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

describe('google-route-parser.util', () => {
  describe('parseGoogleRoutesResponse', () => {
    it('converte uma rota do Google (com pedagio estimado) para CalculatedRoute', () => {
      const result = parseGoogleRoutesResponse(INPUT, {
        routes: [
          {
            distanceMeters: 520_000,
            duration: '23400s',
            polyline: { encodedPolyline: ENCODED_POLYLINE },
            travelAdvisory: {
              tollInfo: { estimatedPrice: [{ currencyCode: 'BRL', units: '128', nanos: 500_000_000 }] },
            },
          },
        ],
      });

      expect(result).toHaveLength(1);
      const route = result[0]!;
      expect(route.originLabel).toBe('Catanduva/SP');
      expect(route.destinationLabel).toBe('Sao Paulo/SP');
      expect(route.originLatitude).toBeCloseTo(38.5, 5);
      expect(route.destinationLatitude).toBeCloseTo(43.252, 5);
      expect(route.distanceMeters).toBe(520_000);
      expect(route.durationSeconds).toBe(23_400);
      expect(route.hasTolls).toBe(true);
      expect(route.estimatedTollAmount).toBe(128.5);
      expect(route.estimatedTollCurrency).toBe('BRL');
    });

    it('rota sem travelAdvisory.tollInfo -> hasTolls false, estimatedTollAmount null', () => {
      const result = parseGoogleRoutesResponse(INPUT, {
        routes: [{ distanceMeters: 1000, duration: '60s', polyline: { encodedPolyline: ENCODED_POLYLINE } }],
      });

      expect(result[0]!.hasTolls).toBe(false);
      expect(result[0]!.estimatedTollAmount).toBeNull();
      expect(result[0]!.estimatedTollCurrency).toBeNull();
    });

    it('devolve multiplas rotas quando o provider retorna alternativas', () => {
      const result = parseGoogleRoutesResponse(INPUT, {
        routes: [
          { distanceMeters: 500_000, duration: '20000s', polyline: { encodedPolyline: ENCODED_POLYLINE } },
          { distanceMeters: 520_000, duration: '21000s', polyline: { encodedPolyline: ENCODED_POLYLINE } },
        ],
      });
      expect(result).toHaveLength(2);
    });

    it('devolve array vazio quando a resposta nao tem rotas', () => {
      expect(parseGoogleRoutesResponse(INPUT, {})).toEqual([]);
      expect(parseGoogleRoutesResponse(INPUT, { routes: [] })).toEqual([]);
    });

    it('lanca erro claro quando a rota nao tem geometria valida', () => {
      expect(() =>
        parseGoogleRoutesResponse(INPUT, { routes: [{ distanceMeters: 100, duration: '10s' }] }),
      ).toThrow(/geometria valida/i);
    });
  });

  describe('parseGoogleDurationSeconds', () => {
    it('parseia o formato "1234s" do protobuf Duration', () => {
      expect(parseGoogleDurationSeconds('1234s')).toBe(1234);
    });

    it('arredonda duracoes fracionarias', () => {
      expect(parseGoogleDurationSeconds('1234.7s')).toBe(1235);
    });

    it('retorna 0 quando ausente', () => {
      expect(parseGoogleDurationSeconds(undefined)).toBe(0);
    });
  });

  describe('googleMoneyToNumber', () => {
    it('combina units (string) e nanos em um numero com 2 casas decimais', () => {
      expect(googleMoneyToNumber({ currencyCode: 'BRL', units: '128', nanos: 500_000_000 })).toBe(128.5);
    });

    it('funciona sem nanos (valor inteiro)', () => {
      expect(googleMoneyToNumber({ currencyCode: 'BRL', units: '90' })).toBe(90);
    });

    it('funciona sem units (menor que 1 unidade)', () => {
      expect(googleMoneyToNumber({ currencyCode: 'BRL', nanos: 500_000_000 })).toBe(0.5);
    });
  });
});
