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
