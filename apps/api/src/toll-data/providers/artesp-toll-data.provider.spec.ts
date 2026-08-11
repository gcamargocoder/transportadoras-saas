import { ServiceUnavailableException } from '@nestjs/common';
import { ArtespTollDataProvider } from './artesp-toll-data.provider';

// Fase 33 -- a pesquisa real (ver relatorio da fase) nao confirmou nenhum
// dataset estruturado da ARTESP/DER-SP automatizavel. Este teste prova que
// o provider NUNCA finge sucesso nem inventa dado: isAvailable() e sempre
// false e fetchPlazas() sempre falha com uma mensagem clara, nunca retorna
// uma lista vazia silenciosa (que poderia ser confundida com "sincronizado
// com zero pracas").
describe('ArtespTollDataProvider', () => {
  it('isAvailable() e sempre false -- nenhuma fonte estruturada confirmada', () => {
    expect(new ArtespTollDataProvider().isAvailable()).toBe(false);
  });

  it('fetchPlazas() sempre lanca ServiceUnavailableException, nunca inventa dado', async () => {
    const provider = new ArtespTollDataProvider();
    await expect(provider.fetchPlazas()).rejects.toThrow(ServiceUnavailableException);
    await expect(provider.fetchPlazas()).rejects.toThrow(/nao possui.*dataset estruturado confirmado/i);
  });
});
