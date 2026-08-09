import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { GoogleRoutingProvider } from './google.provider';

const ENCODED_POLYLINE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

function buildConfigService(googleRoutesApiKey?: string): ConfigService<AppConfig, true> {
  return {
    get: jest.fn().mockReturnValue({
      googleRoutesApiKey,
      tollMatchRadiusMeters: 300,
      requestTimeoutMs: 8000,
    }),
  } as unknown as ConfigService<AppConfig, true>;
}

const INPUT = {
  origin: { label: 'Catanduva/SP' },
  destination: { label: 'Sao Paulo/SP' },
  computeAlternatives: false,
};

describe('GoogleRoutingProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('true quando ha chave configurada', () => {
      expect(new GoogleRoutingProvider(buildConfigService('key-123')).isConfigured()).toBe(true);
    });

    it('false quando nao ha chave', () => {
      expect(new GoogleRoutingProvider(buildConfigService(undefined)).isConfigured()).toBe(false);
    });
  });

  describe('calculateRoutes', () => {
    it('lanca ServiceUnavailableException sem tentar rede quando nao ha chave', async () => {
      const provider = new GoogleRoutingProvider(buildConfigService(undefined));
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      await expect(provider.calculateRoutes(INPUT)).rejects.toThrow(ServiceUnavailableException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('chama a Google Routes API com os headers corretos e converte a resposta', async () => {
      const provider = new GoogleRoutingProvider(buildConfigService('key-123'));
      const fetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          routes: [
            {
              distanceMeters: 520_000,
              duration: '23400s',
              polyline: { encodedPolyline: ENCODED_POLYLINE },
              travelAdvisory: { tollInfo: { estimatedPrice: [{ currencyCode: 'BRL', units: '128' }] } },
            },
          ],
        }),
      });
      global.fetch = fetchSpy as unknown as typeof fetch;

      const result = await provider.calculateRoutes(INPUT);

      expect(result).toHaveLength(1);
      expect(result[0]!.distanceMeters).toBe(520_000);
      expect(result[0]!.estimatedTollAmount).toBe(128);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
      const headers = requestInit.headers as Record<string, string>;
      expect(headers['X-Goog-Api-Key']).toBe('key-123');
      expect(headers['X-Goog-FieldMask']).toContain('routes.polyline.encodedPolyline');
    });

    it('usa coordenadas exatas (nao geocodifica) quando o waypoint ja tem latitude/longitude', async () => {
      const provider = new GoogleRoutingProvider(buildConfigService('key-123'));
      const fetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          routes: [{ distanceMeters: 100, duration: '10s', polyline: { encodedPolyline: ENCODED_POLYLINE } }],
        }),
      });
      global.fetch = fetchSpy as unknown as typeof fetch;

      await provider.calculateRoutes({
        origin: { label: 'Posicao atual', latitude: -23.55, longitude: -46.63 },
        destination: { label: 'Sao Paulo/SP' },
        computeAlternatives: false,
      });

      const [, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(requestInit.body as string) as { origin: unknown; destination: unknown };
      expect(body.origin).toEqual({ location: { latLng: { latitude: -23.55, longitude: -46.63 } } });
      expect(body.destination).toEqual({ address: 'Sao Paulo/SP' });
    });

    it('lanca ServiceUnavailableException quando a chamada de rede falha', async () => {
      const provider = new GoogleRoutingProvider(buildConfigService('key-123'));
      global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

      await expect(provider.calculateRoutes(INPUT)).rejects.toThrow(ServiceUnavailableException);
    });

    it('lanca ServiceUnavailableException quando o Google responde erro, sem vazar o corpo bruto', async () => {
      const provider = new GoogleRoutingProvider(buildConfigService('key-123'));
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'API key not authorized for secret-project-xyz' } }),
      }) as unknown as typeof fetch;

      await expect(provider.calculateRoutes(INPUT)).rejects.toMatchObject({
        message: expect.not.stringContaining('secret-project-xyz'),
      });
    });

    it('lanca NotFoundException quando o provider nao devolve nenhuma rota', async () => {
      const provider = new GoogleRoutingProvider(buildConfigService('key-123'));
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [] }) }) as unknown as typeof fetch;

      await expect(provider.calculateRoutes(INPUT)).rejects.toThrow(NotFoundException);
    });
  });
});
