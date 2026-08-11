// Fase 33, secao 5 -- estrategia deterministica de identidade da praca.
// Usada SOMENTE na primeira sincronizacao de uma praca (sem
// TollPlazaDataSourceLink previo ainda) -- sincronizacoes seguintes
// encontram o vinculo direto por (provider, sourceKey) e nunca precisam
// deste heuristico. Nunca usa so nome, nunca so coordenada (regra explicita
// da fase).
//
// Fase 35 -- assinatura aceita qualquer objeto com esses 3 campos (nao so
// NormalizedTollPlaza inteiro), para o provider de TARIFAS por concessao
// tambem reaproveitar este MESMO algoritmo (nunca um matching paralelo),
// mesmo sem ter sourceKey/name/status/raw de uma praca completa.
export interface TollPlazaMatchInput {
  concessionaire: string;
  highway: string | null;
  km: number | null;
}

export interface TollPlazaMatchCandidate {
  id: string;
  operator: string;
  highway: string | null;
  km: number | null;
}

export type TollPlazaMatchOutcome =
  | { matchedPlazaId: string; confidence: 'LINKED' }
  | { matchedPlazaId: null; confidence: 'LINKED' } // zero candidatos -- seguro criar nova
  | { matchedPlazaId: null; confidence: 'PENDING_REVIEW' }; // ambiguo -- cria nova, mas marca para revisao

const KM_TOLERANCE = 0.5; // 500m -- mesma ordem de grandeza do raio de casamento geografico ja usado em toll-matching.util.ts (Fase 26).

function normalize(value: string): string {
  return value.trim().toUpperCase();
}

// Concessionaria + rodovia identicos (normalizados) + km dentro da
// tolerancia -- prioridades 2-4 da secao 5 combinadas (a fonte ANTT nao
// fornece um identificador oficial estavel, prioridade 1, ver relatorio).
function isPlausibleMatch(normalized: TollPlazaMatchInput, candidate: TollPlazaMatchCandidate): boolean {
  if (normalize(candidate.operator) !== normalize(normalized.concessionaire)) return false;
  if (!candidate.highway || !normalized.highway) return false;
  if (normalize(candidate.highway) !== normalize(normalized.highway)) return false;
  if (candidate.km === null || normalized.km === null) return false;
  return Math.abs(candidate.km - normalized.km) <= KM_TOLERANCE;
}

export function findMatchingTollPlaza(
  normalized: TollPlazaMatchInput,
  candidates: TollPlazaMatchCandidate[],
): TollPlazaMatchOutcome {
  const plausible = candidates.filter((candidate) => isPlausibleMatch(normalized, candidate));

  if (plausible.length === 1) {
    return { matchedPlazaId: plausible[0]!.id, confidence: 'LINKED' };
  }
  if (plausible.length === 0) {
    return { matchedPlazaId: null, confidence: 'LINKED' };
  }
  // 2+ candidatos plausiveis: nunca decide sozinho qual e a praca certa --
  // "se nao for possivel determinar com seguranca... NAO mesclar
  // automaticamente. Marcar para revisao" (secao 5).
  return { matchedPlazaId: null, confidence: 'PENDING_REVIEW' };
}
