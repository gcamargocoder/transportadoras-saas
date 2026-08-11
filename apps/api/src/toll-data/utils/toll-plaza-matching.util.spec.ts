import { NormalizedTollPlaza } from '../interfaces/normalized-toll-plaza.interface';
import { findMatchingTollPlaza, TollPlazaMatchCandidate } from './toll-plaza-matching.util';

function buildNormalized(overrides: Partial<NormalizedTollPlaza> = {}): NormalizedTollPlaza {
  return {
    sourceKey: 'ANTT:X',
    name: 'Praça X',
    concessionaire: 'Autopista Fernão Dias',
    highway: 'BR-381',
    km: 67.8,
    city: 'Mairiporã',
    state: 'SP',
    latitude: -23.34121,
    longitude: -46.573664,
    status: 'Ativo',
    raw: {},
    ...overrides,
  };
}

function buildCandidate(overrides: Partial<TollPlazaMatchCandidate> = {}): TollPlazaMatchCandidate {
  return { id: 'plaza-1', operator: 'Autopista Fernão Dias', highway: 'BR-381', km: 67.8, ...overrides };
}

describe('findMatchingTollPlaza', () => {
  it('sem candidatos: seguro criar uma praca nova (LINKED, matchedPlazaId null)', () => {
    const result = findMatchingTollPlaza(buildNormalized(), []);
    expect(result).toEqual({ matchedPlazaId: null, confidence: 'LINKED' });
  });

  it('exatamente 1 candidato plausivel (mesma concessionaria/rodovia/km proximo): vincula com confianca', () => {
    const candidate = buildCandidate();
    const result = findMatchingTollPlaza(buildNormalized(), [candidate]);
    expect(result).toEqual({ matchedPlazaId: 'plaza-1', confidence: 'LINKED' });
  });

  it('km dentro da tolerancia (500m) ainda conta como o mesmo candidato', () => {
    const candidate = buildCandidate({ km: 67.6 }); // 200m de diferenca
    const result = findMatchingTollPlaza(buildNormalized({ km: 67.8 }), [candidate]);
    expect(result.matchedPlazaId).toBe('plaza-1');
  });

  it('km fora da tolerancia NAO e considerado o mesmo candidato', () => {
    const candidate = buildCandidate({ km: 70.0 }); // 2.2km de diferenca
    const result = findMatchingTollPlaza(buildNormalized({ km: 67.8 }), [candidate]);
    expect(result).toEqual({ matchedPlazaId: null, confidence: 'LINKED' });
  });

  it('concessionaria diferente nunca e considerada a mesma praca, mesmo com rodovia/km identicos', () => {
    const candidate = buildCandidate({ operator: 'Outra Concessionaria' });
    const result = findMatchingTollPlaza(buildNormalized(), [candidate]);
    expect(result.matchedPlazaId).toBeNull();
  });

  it('rodovia diferente nunca e considerada a mesma praca', () => {
    const candidate = buildCandidate({ highway: 'BR-116' });
    const result = findMatchingTollPlaza(buildNormalized(), [candidate]);
    expect(result.matchedPlazaId).toBeNull();
  });

  it('2+ candidatos plausiveis: NUNCA mescla automaticamente -- marca para revisao', () => {
    const candidateA = buildCandidate({ id: 'plaza-a' });
    const candidateB = buildCandidate({ id: 'plaza-b' });
    const result = findMatchingTollPlaza(buildNormalized(), [candidateA, candidateB]);
    expect(result).toEqual({ matchedPlazaId: null, confidence: 'PENDING_REVIEW' });
  });

  it('nunca usa somente o nome para decidir (candidato sem rodovia/km nunca "casa" so por semelhanca de nome)', () => {
    const candidate = buildCandidate({ highway: null, km: null });
    const result = findMatchingTollPlaza(buildNormalized(), [candidate]);
    expect(result.matchedPlazaId).toBeNull();
  });

  it('normaliza caixa e espacos ao comparar concessionaria/rodovia', () => {
    const candidate = buildCandidate({ operator: '  autopista fernão dias ', highway: 'br-381' });
    const result = findMatchingTollPlaza(buildNormalized(), [candidate]);
    expect(result.matchedPlazaId).toBe('plaza-1');
  });
});
