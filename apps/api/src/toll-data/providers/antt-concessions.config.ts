// Fase 35, secao 6 -- configuracao centralizada das concessoes federais
// conhecidas (ver relatorio da Fase 34: 41 concessoes listadas em
// gov.br/antt/.../lista-de-concessoes). NENHUMA URL fica espalhada em
// servicos -- so aqui. Adicionar uma nova concessao = adicionar uma linha
// neste array, nunca reescrever AnttConcessionTollDataProvider.
//
// concessionId e o slug REAL da URL, extraido dos links da propria pagina
// de listagem (NUNCA derivado do nome por transformacao de string -- ver
// relatorio da Fase 34: "Transbrasiliana" e capitalizado sem hifen,
// enquanto a maioria e minuscula-hifenizada; nao ha padrao previsivel).
//
// Escopo desta fase: SOMENTE "via-cristais", a UNICA concessao cuja
// estrutura de pagina (tarifas-de-pedagio + localizacao-das-pracas-de-
// pedagio) foi baixada e verificada byte-a-byte nesta fase (ver
// antt-concession-tariff.parser.spec.ts, fixture real). Adicionar as
// demais 40 concessoes exige apenas incluir a linha abaixo -- MAS cada
// uma deveria ser verificada (ao menos por amostragem) antes de ativada
// em producao, pois a Fase 34 confirmou que nem toda pagina de concessao
// necessariamente segue o mesmo template (ver relatorio: paginas HTML
// geradas por exportacao do Word, propensas a variacao entre publicacoes).
export interface AnttConcessionConfig {
  /// Slug real da URL em gov.br/antt/.../lista-de-concessoes/{concessionId}.
  concessionId: string;
  /// Nome de exibicao -- tambem usado como TollPlaza.operator para o
  /// matching (toll-plaza-matching.util.ts exige concessionaire ==
  /// operator, ambos normalizados).
  name: string;
}

export const ANTT_CONCESSIONS: AnttConcessionConfig[] = [{ concessionId: 'via-cristais', name: 'Via Cristais' }];

const ANTT_CONCESSION_BASE_URL = 'https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes';

export function buildAnttTariffsUrl(concession: AnttConcessionConfig): string {
  return `${ANTT_CONCESSION_BASE_URL}/${concession.concessionId}/revisoes-e-reajustes/tarifas-de-pedagio`;
}

export function buildAnttPlazaLocationsUrl(concession: AnttConcessionConfig): string {
  return `${ANTT_CONCESSION_BASE_URL}/${concession.concessionId}/revisoes-e-reajustes/localizacao-das-pracas-de-pedagio`;
}
