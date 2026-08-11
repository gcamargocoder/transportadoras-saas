// Fase 36, secao "Provider" -- configuracao centralizada das concessoes
// estaduais do RJ conhecidas (ver relatorio da Fase 34/36). Diferente de
// ANTT_CONCESSIONS (Fase 35, 1 de 41 verificada), AQUI as 2 concessoes
// listadas sao 100% das que a AGETRANSP regula com pedagio identificadas
// na pesquisa (Via Lagos/RJ-124 e Rota 116/RJ-116) -- ambas com estrutura
// de pagina verificada byte-a-byte nesta fase (curl real, 10/08/2026).
// Adicionar uma nova concessao = adicionar uma linha aqui, nunca reescrever
// o provider.
export interface RjAgetranspConcessionConfig {
  /// Slug real da URL em agetransp.rj.gov.br/concessionarias/{concessionId}.
  concessionId: string;
  /// Nome de exibicao -- tambem usado como TollPlaza.operator para o
  /// matching por concessionaria (ver rj-agetransp-tariff.provider.ts:
  /// esta fonte nao fornece km por praca, entao o matching e por
  /// concessionaria, nao por tolerancia geografica).
  name: string;
}

export const RJ_AGETRANSP_CONCESSIONS: RjAgetranspConcessionConfig[] = [
  { concessionId: 'vialagos', name: 'Via Lagos' },
  { concessionId: 'rota116', name: 'Rota 116' },
];

const RJ_AGETRANSP_BASE_URL = 'https://www.agetransp.rj.gov.br/concessionarias';

export function buildRjAgetranspTariffUrl(concession: RjAgetranspConcessionConfig): string {
  return `${RJ_AGETRANSP_BASE_URL}/${concession.concessionId}`;
}
