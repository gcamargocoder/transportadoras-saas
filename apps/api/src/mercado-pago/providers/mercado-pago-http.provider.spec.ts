import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { MercadoPagoHttpProvider } from './mercado-pago-http.provider';

function buildConfigService(accessToken?: string): ConfigService<AppConfig, true> {
  return {
    get: jest.fn().mockReturnValue({
      accessToken,
      webhookSecret: 'secret',
      adminWebUrl: 'http://localhost:3000',
      requestTimeoutMs: 8000,
    }),
  } as unknown as ConfigService<AppConfig, true>;
}

const PREAPPROVAL_INPUT = {
  reason: 'Assinatura PROFESSIONAL',
  payerEmail: 'admin@teste.com',
  externalReference: 'tenant-1',
  transactionAmount: 499.9,
  frequency: 1,
  frequencyType: 'months' as const,
  startDate: new Date('2026-10-01T00:00:00.000Z'),
  backUrl: 'http://localhost:3000/settings/company',
};

describe('MercadoPagoHttpProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('true quando ha access token configurado', () => {
      expect(new MercadoPagoHttpProvider(buildConfigService('token-123')).isConfigured()).toBe(true);
    });

    it('false quando nao ha access token', () => {
      expect(new MercadoPagoHttpProvider(buildConfigService(undefined)).isConfigured()).toBe(false);
    });
  });

  describe('createPreapproval', () => {
    it('lanca ServiceUnavailableException sem tentar rede quando nao ha token', async () => {
      const provider = new MercadoPagoHttpProvider(buildConfigService(undefined));
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      await expect(provider.createPreapproval(PREAPPROVAL_INPUT)).rejects.toThrow(ServiceUnavailableException);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('chama POST /preapproval com o corpo correto e converte a resposta', async () => {
      const provider = new MercadoPagoHttpProvider(buildConfigService('token-123'));
      const fetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'preapproval-1',
          status: 'pending',
          payer_id: null,
          external_reference: 'tenant-1',
          init_point: 'https://mercadopago.com/checkout/preapproval-1',
        }),
      });
      global.fetch = fetchSpy as unknown as typeof fetch;

      const result = await provider.createPreapproval(PREAPPROVAL_INPUT);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.mercadopago.com/preapproval',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        }),
      );
      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string);
      expect(body.auto_recurring).toEqual({
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 499.9,
        currency_id: 'BRL',
        start_date: '2026-10-01T00:00:00.000Z',
      });
      expect(result).toEqual({
        id: 'preapproval-1',
        status: 'pending',
        payerId: null,
        externalReference: 'tenant-1',
        initPoint: 'https://mercadopago.com/checkout/preapproval-1',
      });
    });

    it('lanca ServiceUnavailableException quando o Mercado Pago responde com erro', async () => {
      const provider = new MercadoPagoHttpProvider(buildConfigService('token-123'));
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'invalid payer_email' }),
      }) as unknown as typeof fetch;

      await expect(provider.createPreapproval(PREAPPROVAL_INPUT)).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('getPayment', () => {
    it('chama GET /v1/payments/:id e converte a resposta', async () => {
      const provider = new MercadoPagoHttpProvider(buildConfigService('token-123'));
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 987654,
          status: 'approved',
          external_reference: 'tenant-1',
          transaction_amount: 499.9,
        }),
      }) as unknown as typeof fetch;

      const result = await provider.getPayment('987654');

      expect(result).toEqual({
        id: '987654',
        status: 'approved',
        externalReference: 'tenant-1',
        transactionAmount: 499.9,
      });
    });
  });
});
