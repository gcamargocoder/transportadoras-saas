// Fase 29 -- limiares do monitoramento operacional, centralizados aqui (nunca
// espalhados como numero magico pelo service/util). STALE_THRESHOLD_MINUTES
// tem um default proprio SOMENTE para quando o tenant ainda nao tem
// TenantSettings.alertDelayThresholdMin configurado -- em condicoes normais o
// valor efetivo vem do tenant (reaproveita o campo ja existente, que ate a
// Fase 29 nao era consumido por nenhum codigo).
export const DEFAULT_STALE_THRESHOLD_MINUTES = 15;

// OFFLINE = sem nenhuma posicao OU a ultima posicao e mais antiga que
// STALE * este multiplicador (ex: 15min stale -> 60min offline). Um unico
// lugar para ajustar a distincao STALE/OFFLINE.
export const OFFLINE_THRESHOLD_MULTIPLIER = 4;

// Velocidade minima (km/h) para considerar o veiculo em movimento. Abaixo
// disso (mas com leitura de velocidade disponivel) e STOPPED. Sem leitura de
// velocidade nenhuma, o movimento e UNKNOWN -- nunca inventado.
export const MOVING_SPEED_THRESHOLD_KMH = 3;
