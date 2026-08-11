import { TollDataProvider } from '@prisma/client';

// Fase 33, secao 6 -- camada de normalizacao entre o formato bruto de cada
// fonte oficial (ANTT/ARTESP/...) e o dominio interno (TollPlaza). A regra
// de negocio (matching, upsert) NUNCA depende do formato bruto de uma fonte
// especifica -- so deste tipo normalizado, comum a todos os providers.
//
// Campos ausentes na fonte ficam null/undefined -- nunca inventados (ver
// principio fundamental da fase). name/highway/km/city/state/coordinates
// refletem exatamente o que a ANTT/ARTESP publicam; nenhum valor e
// estimado ou copiado de outra praca.
export interface NormalizedTollPlaza {
  /// Chave determinística derivada dos campos brutos da fonte (ver
  /// toll-plaza-matching.util.ts) -- usada para nao recriar a praca a cada
  /// sincronizacao.
  sourceKey: string;
  name: string;
  concessionaire: string;
  highway: string | null;
  km: number | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  /// Situacao operacional informada pela fonte (ex: "Ativo") -- so
  /// repassada, nunca interpretada como regra de negocio nesta fase.
  status: string | null;
  /// Instantaneo bruto (ja normalizado) guardado para auditoria futura em
  /// TollPlazaDataSourceLink.rawSnapshot -- nunca usado para decidir regra.
  raw: Record<string, unknown>;
}

// Resultado de uma coleta (Fase 33, secao 9) -- o provider so LE e
// normaliza; quem decide criar/atualizar/rejeitar e o TollDataSyncService.
export interface TollDataProviderFetchResult {
  plazas: NormalizedTollPlaza[];
  /// Referencia ao documento/arquivo de origem (nome do resource, URL) --
  /// preenche TollDataSyncRun/observabilidade, nunca inventado.
  sourceReference: string;
}

// Resultado de uma coleta de tarifas (Fase 35) -- mesmo espirito de
// TollDataProviderFetchResult, mas para o dominio de tarifas em vez de
// pracas. tariffs ja normalizadas o suficiente para o matching (rodovia/km)
// e para virar TollRate; nunca inclui a decisao de qual TollPlaza cada
// registro pertence -- isso e responsabilidade do TollDataSyncService
// (reaproveitando toll-plaza-matching.util.ts, nunca um algoritmo novo).
export interface TollTariffProviderFetchResult {
  tariffs: NormalizedTollTariff[];
  sourceReference: string;
  /// Fase 35, secao 18 -- concessoes que falharam individualmente (nome +
  /// motivo sanitizado). Uma falha aqui NUNCA impede as demais concessoes
  /// de serem sincronizadas nem apaga dados previos daquela concessao.
  failedConcessions: { name: string; reason: string }[];
}

// Campos minimos que qualquer fonte de tarifa por concessao precisa prover
// para o matching + persistencia (secao 8/9/15 da Fase 35; renomeado de
// NormalizedAnttConcessionTariffWithSource na Fase 36 quando passou a ser
// compartilhado por ANTT_TARIFAS e RJ_AGETRANSP -- nunca um tipo por
// provider). "concessionaire" aqui e o MESMO conceito de
// NormalizedTollPlaza.concessionaire -- permite reaproveitar
// toll-plaza-matching.util.ts sem adaptar o util em si. highway/km sao
// NULL quando a fonte nao fornece geolocalizacao por praca (ex:
// RJ/AGETRANSP -- ver rj-agetransp-tariff.provider.ts): nesse caso o
// TollDataSyncService aplica um matching por concessionaria (nunca por
// nome isolado sozinho -- ver secao correspondente no relatorio da Fase 36).
export interface NormalizedTollTariff {
  concessionaire: string;
  highway: string | null;
  km: number | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  axleCategory: string;
  price: number;
  currency: string;
  /// Identificador estavel do documento/pagina de origem (ex: URL da
  /// concessao) -- preenche TollRate.sourceReference, nunca inventado.
  sourceReference: string;
  sourceDocument: string;
  /// Fase 36 -- quando a fonte publica a vigencia legal explicita (ex:
  /// "Cobrança praticada a partir de 01/08/2025" da AGETRANSP), a data
  /// real -- nunca a data de coleta. Ausente (undefined) quando a fonte
  /// nao publica vigencia (ex: ANTT_TARIFAS) -- nesse caso o chamador usa
  /// a data de coleta como aproximacao conservadora.
  effectiveFrom?: Date;
  /// Fase 36 -- VERIFIED somente quando a fonte fornece vigencia legal
  /// confirmada (RJ/AGETRANSP); PENDING_REVIEW (padrao) quando a vigencia
  /// e so uma aproximacao pela data de coleta (ANTT_TARIFAS). Nunca
  /// VERIFIED por padrao -- decisao explicita do provider, nunca fingida.
  status?: 'VERIFIED' | 'PENDING_REVIEW';
}

// Fase 33, secao 6/37 -- porta que qualquer novo provider (DER, AGERGS...)
// precisa implementar. Adicionar uma nova fonte = criar um adapter novo que
// implementa esta interface + seus testes, sem reescrever o dominio (Parte
// 37 da fase). Mesma filosofia de RoutingProviderPort (Fase 26) -- nunca
// duplicada, so espelhada para o dominio de dados de pedagio.
//
// Fase 35 -- fetchPlazas/fetchTariffs sao ambos OPCIONAIS: um provider
// implementa UM dos dois (nunca precisou dos dois nesta fase), e
// TollDataSyncService decide o fluxo de sincronizacao (praca vs tarifa)
// verificando qual metodo o provider resolvido de fato implementa. Isso
// evita duplicar o orquestrador (ensureSource/TollDataSyncRun/scheduler/
// endpoint) para cada novo "tipo" de fonte -- so o parser/normalizacao
// muda por provider.
export interface TollDataProviderPort {
  readonly provider: TollDataProvider;
  /// true somente quando a fonte tem um endpoint de dados estruturado
  /// confirmado e automatizavel nesta fase (ver relatorio da Fase 33 -- ARTESP
  /// hoje retorna false: tarifas e localizacao de praca so existem em PDF/
  /// pagina interativa, nunca confirmados como estruturados).
  isAvailable(): boolean;
  fetchPlazas?(): Promise<TollDataProviderFetchResult>;
  fetchTariffs?(): Promise<TollTariffProviderFetchResult>;
}
