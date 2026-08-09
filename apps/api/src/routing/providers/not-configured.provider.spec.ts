import { ServiceUnavailableException } from '@nestjs/common';
import { NotConfiguredRoutingProvider } from './not-configured.provider';

describe('NotConfiguredRoutingProvider', () => {
  it('isConfigured() e sempre false', () => {
    expect(new NotConfiguredRoutingProvider().isConfigured()).toBe(false);
  });

  it('calculateRoutes() nunca simula dados -- sempre lanca erro claro', async () => {
    const provider = new NotConfiguredRoutingProvider();
    await expect(
      provider.calculateRoutes({
        origin: { label: 'A' },
        destination: { label: 'B' },
        computeAlternatives: false,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
