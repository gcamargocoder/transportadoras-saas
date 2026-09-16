import { ServiceUnavailableException } from '@nestjs/common';
import { NotConfiguredMercadoPagoProvider } from './not-configured-mercado-pago.provider';

const PREAPPROVAL_INPUT = {
  reason: 'Assinatura',
  payerEmail: 'admin@teste.com',
  externalReference: 'tenant-1',
  transactionAmount: 100,
  frequency: 1,
  frequencyType: 'months' as const,
  startDate: new Date(),
  backUrl: 'http://localhost:3000/settings/company',
};

describe('NotConfiguredMercadoPagoProvider', () => {
  it('isConfigured() e sempre false', () => {
    expect(new NotConfiguredMercadoPagoProvider().isConfigured()).toBe(false);
  });

  it('createPreapproval nunca simula dados -- sempre lanca erro claro', async () => {
    const provider = new NotConfiguredMercadoPagoProvider();
    await expect(provider.createPreapproval(PREAPPROVAL_INPUT)).rejects.toThrow(ServiceUnavailableException);
  });

  it('getPreapproval nunca simula dados', async () => {
    const provider = new NotConfiguredMercadoPagoProvider();
    await expect(provider.getPreapproval('123')).rejects.toThrow(ServiceUnavailableException);
  });

  it('getPayment nunca simula dados', async () => {
    const provider = new NotConfiguredMercadoPagoProvider();
    await expect(provider.getPayment('123')).rejects.toThrow(ServiceUnavailableException);
  });
});
