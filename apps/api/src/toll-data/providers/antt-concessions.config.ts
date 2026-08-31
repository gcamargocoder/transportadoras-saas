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
// Fase "Expansao ANTT" -- cada uma das 40 concessoes restantes foi
// verificada INDIVIDUALMENTE por download real (curl) das suas 2 paginas
// (tarifas-de-pedagio + localizacao-das-pracas-de-pedagio) antes de
// entrar nesta lista -- nunca em lote/template assumido. Confirmado nesta
// verificacao: o caminho das paginas NAO segue um padrao unico (a Fase 34
// ja alertava sobre isso -- HTML gerado por exportacao do Word, propenso a
// variacao). 3 formatos reais encontrados:
//   - "tarifas-de-pedagio" direto (maioria) -- default abaixo.
//   - "revisoes-e-reajustes/tarifas-de-pedagio" (so Via Cristais).
//   - "tarifas-de-pedagio/tarifas-de-pedagio", segmento duplicado na
//     propria fonte (Nova 381, Way-153/rota-sertaneja, Way-262).
// Fase "Recuperacao ANTT" -- reverificadas as 14 concessoes que ainda nao
// sincronizavam; 8 recuperadas (caminho real era outro, ou a tabela usava
// um formato de tarifa sem coluna "Multiplicador" -- ver
// antt-concession-tariff.parser.ts) e um 4o formato de caminho real
// confirmado: "tarifas-de-pedagio/tarifas-de-pedagio/tarifas-de-pedagio"
// (widget de abas, EPR Iguacu e PR Vias). 6 permanecem fora desta lista
// por falha real de verificacao (nunca por omissao) -- ver "CONCESSOES NAO
// ATIVADAS" no final deste arquivo para o motivo exato de cada uma.
//
// `name` e tambem usado como TollPlaza.operator para o matching
// (toll-plaza-matching.util.ts exige concessionaire == operator, ambos
// normalizados por case) -- por isso, para as concessoes que JA aparecem
// no dataset KMZ de pracas (AnttTollDataProvider), `name` usa o valor
// EXATO do campo `concession` daquele KMZ (baixado e conferido nesta
// verificacao), nunca o texto de exibicao da pagina de tarifas (que pode
// ter grafia diferente -- ex: pagina mostra "Via Brasil", KMZ publica
// "CONCESSIONARIA VIA BRASIL BR-163"). Para as que NAO aparecem no KMZ
// (marcadas abaixo), `name` usa o titulo oficial da propria pagina da
// concessao -- nenhuma tarifa dessas sera vinculada a uma praca ate que o
// dataset de pracas da ANTT (fonte separada, fetchPlazas()) passe a
// listar essa concessionaria; o proprio TollDataSyncService ja trata isso
// com seguranca (recordsRejected, nunca cria praca nem inventa vinculo).
export interface AnttConcessionConfig {
  /// Slug real da URL em gov.br/antt/.../lista-de-concessoes/{concessionId}.
  concessionId: string;
  /// Nome de exibicao -- tambem usado como TollPlaza.operator para o
  /// matching (toll-plaza-matching.util.ts exige concessionaire ==
  /// operator, ambos normalizados).
  name: string;
  /// Caminho real (apos "/{concessionId}/") das 2 paginas-irma desta
  /// concessao. Omitido = usa DEFAULT_TARIFF_PATH/DEFAULT_PLAZA_PATH.
  tariffPath?: string;
  plazaPath?: string;
}

const DEFAULT_TARIFF_PATH = 'tarifas-de-pedagio';
const DEFAULT_PLAZA_PATH = 'localizacao-das-pracas-de-pedagio';
const DOUBLED_TARIFF_PATH = 'tarifas-de-pedagio/tarifas-de-pedagio';
const DOUBLED_PLAZA_PATH = 'tarifas-de-pedagio/localizacao-das-pracas-de-pedagio';
// Fase "Recuperacao ANTT" -- EPR Iguacu e PR Vias publicam a tarifa/
// localizacao num widget de abas (govbr-tabs) cujo conteudo real so existe
// num 3o nivel de URL (o SEGMENTO FINAL do caminho ja duplicado se repete
// mais uma vez) -- confirmado por download real do atributo data-url do
// proprio HTML (nunca adivinhado por padrao). A pagina no caminho
// duplicado (sem o 3o nivel) so mostra um placeholder "Carregando
// conteudo da aba...", nunca a tabela.
const TRIPLED_TARIFF_PATH = 'tarifas-de-pedagio/tarifas-de-pedagio/tarifas-de-pedagio';
const TRIPLED_PLAZA_PATH = 'tarifas-de-pedagio/localizacao-das-pracas-de-pedagio/localizacao-das-pracas-de-pedagio';

export const ANTT_CONCESSIONS: AnttConcessionConfig[] = [
  // Ja ativada antes desta fase -- caminho preservado exatamente (nenhuma
  // mudanca de comportamento).
  {
    concessionId: 'via-cristais',
    name: 'Via Cristais',
    tariffPath: 'revisoes-e-reajustes/tarifas-de-pedagio',
    plazaPath: 'revisoes-e-reajustes/localizacao-das-pracas-de-pedagio',
  },

  // -- presentes no dataset KMZ de pracas (name = valor EXATO do campo
  // `concession`, confirmado por download real do KMZ nesta verificacao) --
  { concessionId: 'autopista-fluminense', name: 'AUTOPISTA FLUMINENSE' },
  { concessionId: 'autopista-regis-bittencourt', name: 'AUTOPISTA REGIS BITTENCOURT' },
  { concessionId: 'ccr-rio-sp', name: 'HOLDING DO SISTEMA RODOVIARIO RIO - SAO PAULO S.A.' },
  { concessionId: 'ccr-viacosteira', name: 'VIA COSTEIRA' },
  { concessionId: 'concebra', name: 'CONCEBRA' },
  { concessionId: 'concer', name: 'CONCER' },
  { concessionId: 'eco050', name: 'ECO050' },
  { concessionId: 'ecoponte', name: 'ECOPONTE' },
  { concessionId: 'ecovias-araguaia', name: 'ECOVIAS DO ARAGUAIA' },
  { concessionId: 'ecovias-capixaba', name: 'ECO101 CONCESSIONARIA DE RODOVIAS S/A' },
  { concessionId: 'ecovias-do-cerrado', name: 'ECOVIAS DO CERRADO' },
  { concessionId: 'rodovia-do-aco-caducidade-declarada', name: 'RODOVIA DO AÇO' },
  { concessionId: 'rota-do-oeste', name: 'CRO' },
  { concessionId: 'Transbrasiliana', name: 'TRANSBRASILIANA' },
  { concessionId: 'via-040', name: 'VIA 040' },
  { concessionId: 'via-bahia', name: 'VIA BAHIA' },
  { concessionId: 'via-brasil', name: 'CONCESSIONÁRIA VIA BRASIL BR-163' },
  { concessionId: 'viasul', name: 'VIA SUL' },

  // -- NAO presentes no dataset KMZ de pracas hoje (name = titulo oficial
  // da propria pagina gov.br da concessao). Tarifa fica registrada em
  // TollRate normalmente, mas sem praca correspondente ainda no banco --
  // nenhum vinculo e forcado; sera criado automaticamente quando o dataset
  // de pracas passar a listar essa concessionaria. --
  { concessionId: 'epr-litoral-pioneiro', name: 'EPR Litoral Pioneiro' },
  { concessionId: 'motiva-minas-sp', name: 'Motiva Minas SP' },
  { concessionId: 'nova-364', name: 'Nova 364' },
  { concessionId: 'nova-dutra', name: 'Nova Dutra' },
  { concessionId: 'via-araucaria', name: 'Via Araucaria' },
  { concessionId: 'way-262', name: 'Way-262', tariffPath: DOUBLED_TARIFF_PATH, plazaPath: DOUBLED_PLAZA_PATH },
  { concessionId: 'nova-381', name: 'Nova 381', tariffPath: DOUBLED_TARIFF_PATH, plazaPath: DOUBLED_PLAZA_PATH },
  { concessionId: 'rota-sertaneja', name: 'Way-153', tariffPath: DOUBLED_TARIFF_PATH, plazaPath: DOUBLED_PLAZA_PATH },

  // Fase "Recuperacao ANTT" -- recuperadas nesta fase (verificadas
  // INDIVIDUALMENTE por download real da pagina-indice de cada concessao,
  // que revelou o link real -- nenhuma delas usava o caminho padrao
  // presumido na fase anterior, por isso ficavam sem sincronizar).
  //
  // -- presentes no dataset KMZ de pracas (name = valor EXATO do campo
  // `concession`, confirmado por consulta real ao TollPlaza ja sincronizado) --
  { concessionId: 'autopista-litoral-sul', name: 'AUTOPISTA LITORAL SUL', tariffPath: 'tarifas-de-pedagios' },
  {
    concessionId: 'autopista-planalto-sul',
    name: 'AUTOPISTA PLANALTO SUL',
    tariffPath: 'tarifas-de-pedagio-autopista-planalto-sul',
  },
  {
    concessionId: 'ecoriominas',
    name: 'ECORIOMINAS',
    tariffPath: 'revisoes-e-reajustes/tarifas-de-pedagios',
    plazaPath: 'revisoes-e-reajustes/localizacao-das-pracas-de-pedagio',
  },
  // Motivo original da falha (fase anterior) NAO era o caminho (que ja
  // batia com o default) -- era a propria tabela nao ter coluna
  // "Multiplicador" (formato de valor direto, ver
  // antt-concession-tariff.parser.ts: parseDirectValueTariffTable).
  { concessionId: 'ecosul-contrato-encerrado', name: 'ECOSUL' },

  // -- NAO presentes no dataset KMZ de pracas hoje (mesmo tratamento ja
  // usado para nova-364/nova-dutra/etc.: tarifa fica registrada, mas sem
  // praca correspondente ate o dataset de pracas listar essa
  // concessionaria -- TollDataSyncService.applyTariffs nunca cria praca
  // nova a partir de uma sincronizacao de tarifa). --
  { concessionId: 'epr-via-mineira', name: 'EPR Via Mineira', tariffPath: 'tarifas-de-pedagios-via-mineira' },
  { concessionId: 'motiva-pantanal', name: 'Motiva Pantanal', plazaPath: 'localizacao-das-pracas-de-pedagio-1' },
  {
    concessionId: 'epr-iguacu',
    name: 'EPR Iguaçu',
    tariffPath: TRIPLED_TARIFF_PATH,
    plazaPath: TRIPLED_PLAZA_PATH,
  },
  {
    concessionId: 'pr-vias',
    name: 'PR Vias',
    tariffPath: TRIPLED_TARIFF_PATH,
    // Unica das 2 concessoes com o mesmo widget de abas que NAO repete o
    // segmento final "puro" -- confirmado por download real do href do
    // documento (Plone), que aqui tem o sufixo "-pr-vias".
    plazaPath: 'tarifas-de-pedagio/localizacao-das-pracas-de-pedagio/localizacao-das-pracas-de-pedagio-pr-vias',
  },
];

// ============================================================================
// CONCESSOES NAO ATIVADAS (6 de 41, apos a Fase "Recuperacao ANTT" -- eram
// 14) -- verificadas e descartadas nesta fase, nunca por omissao. Motivo
// exato de cada uma (link real da pagina-indice sempre seguido antes de
// descartar -- nunca assumido "sem fonte" so pelo caminho padrao falhar):
//
// - rota-agro, rota-verde-goias: concessoes FREE FLOW confirmadas por
//   fonte oficial/imprensa (ANTT autorizou cobranca 100% eletronica sem
//   cancela em 27/08/2026 para rota-agro; rota-verde-goias opera sob o
//   mesmo modelo desde a assinatura do contrato) -- consistente com a
//   pasta de tarifa/localizacao vazia na fonte ANTT (nenhuma praca FISICA
//   a catalogar neste formato). Fora de escopo desta fase (regra
//   explicita: nao alterar Free Flow) -- ver Fase "Free Flow / Porticos
//   de Pedagio" para o dominio correspondente (TollPlaza.type).
// - ecovias-das-gerais: pagina de tarifa carrega (HTTP 200) mas retorna
//   pasta vazia ("Atualmente nao existem itens nessa pasta") -- contrato
//   assinado recentemente (03/06/2026, confirmado por fonte oficial),
//   consistente com tarifa ainda nao publicada. Nao e falha de parser.
// - epr-parana, via-campos: tabela de TARIFA encontrada e parseavel
//   normalmente (48 e 36 linhas brutas respectivamente), mas a pagina de
//   LOCALIZACAO das pracas retorna pasta vazia confirmada ("Atualmente nao
//   existem itens nessa pasta") -- normalizeAnttConcessionTariffs exige as
//   duas paginas para combinar praca+valor; sem localizacao, nenhuma
//   correspondencia pode ser feita com seguranca (nunca inventada). Nao
//   adicionadas a ANTT_CONCESSIONS: ativa-las produziria sempre 0 tarifas
//   importadas (indistinguivel de uma falha real de estrutura no
//   resultado da sincronizacao).
// - elovias: tabela de tarifa encontrada e parseavel (36 linhas brutas),
//   mas NENHUM link de localizacao de pracas foi encontrado em nenhuma
//   fonte oficial -- nem na pagina-indice da ANTT (so 1 link, o de
//   tarifa), nem no site da propria concessionaria (elovias.com.br/
//   servicos/pracas-de-pedagio, verificado: conteudo renderizado via
//   JavaScript client-side, sem dado estruturado no HTML estatico). Mesmo
//   motivo de epr-parana/via-campos -- nao adicionada por produzir sempre
//   0 tarifas importadas.
//
// Reavaliar cada uma exigiria: para rota-agro/rota-verde-goias, tratamento
// especifico de Free Flow (fora de escopo); para as demais, aguardar a
// fonte oficial publicar a localizacao das pracas (ecovias-das-gerais) ou
// encontrar uma fonte estruturada alternativa real (epr-parana, via-campos,
// elovias) -- nunca inventar coordenada/km para viabilizar o matching.
// ============================================================================

const ANTT_CONCESSION_BASE_URL = 'https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes';

export function buildAnttTariffsUrl(concession: AnttConcessionConfig): string {
  return `${ANTT_CONCESSION_BASE_URL}/${concession.concessionId}/${concession.tariffPath ?? DEFAULT_TARIFF_PATH}`;
}

export function buildAnttPlazaLocationsUrl(concession: AnttConcessionConfig): string {
  return `${ANTT_CONCESSION_BASE_URL}/${concession.concessionId}/${concession.plazaPath ?? DEFAULT_PLAZA_PATH}`;
}
