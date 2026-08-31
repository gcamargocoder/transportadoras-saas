import { ANTT_CONCESSIONS, buildAnttPlazaLocationsUrl, buildAnttTariffsUrl } from './antt-concessions.config';

// Fase "Expansao ANTT" -- garante que a expansao de 1 para 27 concessoes
// nao introduziu nenhum concessionId duplicado (romperia o loop sequencial
// de AnttConcessionTollDataProvider.fetchTariffs, sincronizando a mesma
// URL duas vezes) nem nenhum campo vazio.
describe('antt-concessions.config', () => {
  it('nenhum concessionId duplicado', () => {
    const ids = ANTT_CONCESSIONS.map((c) => c.concessionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo concessionId e name sao nao-vazios', () => {
    for (const concession of ANTT_CONCESSIONS) {
      expect(concession.concessionId.trim().length).toBeGreaterThan(0);
      expect(concession.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('via-cristais preserva o caminho ja usado em producao antes desta fase', () => {
    const viaCristais = ANTT_CONCESSIONS.find((c) => c.concessionId === 'via-cristais')!;
    expect(buildAnttTariffsUrl(viaCristais)).toBe(
      'https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes/via-cristais/revisoes-e-reajustes/tarifas-de-pedagio',
    );
    expect(buildAnttPlazaLocationsUrl(viaCristais)).toBe(
      'https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes/via-cristais/revisoes-e-reajustes/localizacao-das-pracas-de-pedagio',
    );
  });

  it('concessao sem tariffPath/plazaPath explicito usa o padrao simples (maioria confirmada na verificacao real)', () => {
    const concessao = ANTT_CONCESSIONS.find((c) => c.concessionId === 'concebra')!;
    expect(buildAnttTariffsUrl(concessao)).toBe(
      'https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes/concebra/tarifas-de-pedagio',
    );
    expect(buildAnttPlazaLocationsUrl(concessao)).toBe(
      'https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes/concebra/localizacao-das-pracas-de-pedagio',
    );
  });

  it('concessao com segmento duplicado confirmado na fonte real usa o caminho explicito', () => {
    const way262 = ANTT_CONCESSIONS.find((c) => c.concessionId === 'way-262')!;
    expect(buildAnttTariffsUrl(way262)).toBe(
      'https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes/way-262/tarifas-de-pedagio/tarifas-de-pedagio',
    );
  });

  it('27 concessoes da Fase "Expansao ANTT" + 8 recuperadas na Fase "Recuperacao ANTT" somam 35 ativas', () => {
    expect(ANTT_CONCESSIONS).toHaveLength(35);
  });

  it('concessao com widget de abas (3o nivel de URL) usa o caminho explicito confirmado', () => {
    const eprIguacu = ANTT_CONCESSIONS.find((c) => c.concessionId === 'epr-iguacu')!;
    expect(buildAnttTariffsUrl(eprIguacu)).toBe(
      'https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes/epr-iguacu/tarifas-de-pedagio/tarifas-de-pedagio/tarifas-de-pedagio',
    );
  });
});
