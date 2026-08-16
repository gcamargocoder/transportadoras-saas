// Fase 41 -- limiares da camada de alertas operacionais, centralizados aqui
// (nunca numero magico espalhado pelo service), mesmo padrao ja usado em
// trips/constants/monitoring.constants.ts (Fase 29). Sao limiares de
// VISUALIZACAO (destacar outliers na tela), nao regras de negocio
// persistidas -- nenhum alerta gerado aqui e gravado no banco.

// Veiculo em destaque quando seu custo total no periodo excede a media da
// frota multiplicada por este fator.
export const COST_OUTLIER_MULTIPLIER = 2;

// Veiculo em destaque quando sua quantidade de manutencoes no periodo
// excede a media da frota multiplicada por este fator.
export const MAINTENANCE_COUNT_OUTLIER_MULTIPLIER = 2;

// Veiculo em destaque quando seu tempo total parado (minutos) no periodo
// excede a media da frota multiplicada por este fator.
export const STOP_TIME_OUTLIER_MULTIPLIER = 2;

// Uma parada aberta (TripStop.endedAt = null) mais antiga que este limiar
// (minutos) gera o alerta STALLED_VEHICLE -- mesmo espirito do
// STALE_THRESHOLD_MINUTES do monitoramento (Fase 29), mas aplicado a
// parada registrada, nao a ultima posicao GPS.
export const STALLED_STOP_MINUTES = 240;

// Fase 42 -- abastecimento. Preco/litro varia menos, na pratica, do que
// custo total ou frequencia de manutencao (nao faz sentido reusar 2x aqui
// -- quase nunca dispararia) -- 20% acima da media da frota.
export const PRICE_PER_LITER_OUTLIER_MULTIPLIER = 1.2;

// Consumo (km/L) "muito acima" (>= media * multiplicador) ou "muito
// abaixo" (<= media / multiplicador) da media da frota -- so aplicado a
// veiculos com consumption.available=true (nunca compara contra um
// veiculo sem dado suficiente).
export const CONSUMPTION_OUTLIER_MULTIPLIER = 1.5;

// Quantidade de litros de UM abastecimento comparada a media de litros/
// abastecimento da frota -- flag de "abastecimento com quantidade
// excepcional" (secao I item 4 do pedido).
export const SUPPLY_VOLUME_OUTLIER_MULTIPLIER = 2;

// Quantidade minima de abastecimentos de um veiculo, dentro do escopo
// filtrado, para calcular consumo/custo-por-km com confianca (o primeiro
// abastecimento so estabelece o odometro inicial, sem trecho anterior
// para medir -- ver common/utils/fuel-consumption.util.ts). Nao e um
// limiar de visualizacao ajustavel como os acima -- e uma exigencia
// estrutural da metodologia (documentado aqui mesmo assim, para nunca
// virar um "2" magico solto no service).
export const MIN_SUPPLIES_FOR_CONSUMPTION = 2;

// Fase 44 -- limite (minutos) por TripStopType para o alerta de "duracao
// longa" de parada (GET /fleet-operations/stops). Estes sao valores
// PADRAO/CONFIGURAVEIS -- NAO sao uma regra de negocio oficial da
// transportadora, apenas um ponto de partida seguro para tenants que ainda
// nao configuraram nada. Cada tenant pode sobrescrever via
// TenantSettings.preferences.stopDurationThresholdsMinutes (ver
// stop-duration-thresholds.util.ts), sem precisar de migration -- reaproveita
// a coluna `preferences` (JSON) ja existente em TenantSettings, nunca uma
// tabela nova. Tipos sem entrada aqui (ex: OTHER, WAITING_LOADING) so geram
// alerta se o tenant configurar um limite explicitamente -- nunca um valor
// inventado para um tipo sem exemplo de negocio conhecido.
export const DEFAULT_STOP_DURATION_THRESHOLDS_MINUTES: Partial<Record<string, number>> = {
  FUEL: 30,
  LOADING: 120,
  UNLOADING: 120,
  MAINTENANCE: 180,
  REST: 60,
  DOCUMENTATION: 30,
};

// Quantidade maxima de alertas de duracao longa retornados por
// GET /fleet-operations/stops -- mesmo espirito de ALERTS_LIMIT_PER_TYPE
// (nunca uma lista sem limite), mas aqui e um total (nao "por tipo"), ja
// que o alerta e por OCORRENCIA de parada, nao por veiculo.
export const LONG_STOP_DURATION_ALERTS_LIMIT = 20;

// Fase 45 -- manutencao. Mesmo multiplicador 2x ja usado em TODOS os
// outros outliers deste arquivo (COST_OUTLIER_MULTIPLIER,
// MAINTENANCE_COUNT_OUTLIER_MULTIPLIER, STOP_TIME_OUTLIER_MULTIPLIER) --
// nao um numero novo inventado, so o mesmo criterio ja estabelecido
// aplicado aos 3 novos alertas de manutencao (custo especifico de
// manutencao, quebras/corretivas e tempo parado).
export const MAINTENANCE_HIGH_COST_MULTIPLIER = 2;
export const EXCESSIVE_BREAKDOWN_MULTIPLIER = 2;
export const EXCESSIVE_DOWNTIME_MULTIPLIER = 2;

// Quantidade maxima de planos vencidos/proximos retornados por
// GET /fleet-operations/maintenance (mesmo espirito de
// LONG_STOP_DURATION_ALERTS_LIMIT).
export const MAINTENANCE_PLAN_ALERTS_LIMIT = 20;

// Iteracao "Tempo parado e receita perdida" (GET
// /fleet-operations/downtime-cost). Quantidade minima de viagens
// CONCLUIDAS de um veiculo para confiar na taxa de receita/hora derivada
// (mesmo espirito estrutural de MIN_SUPPLIES_FOR_CONSUMPTION -- evita uma
// taxa baseada em 1 unica viagem atipica).
export const MIN_TRIPS_FOR_REVENUE_RATE = 2;

// Mesmo multiplicador 2x ja padrao em todo este arquivo, aplicado a
// receita perdida estimada por veiculo (so entre veiculos com taxa
// disponivel -- nunca comparado contra um veiculo sem dado suficiente).
export const DOWNTIME_COST_OUTLIER_MULTIPLIER = 2;
