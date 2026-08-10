// Fase 29, secao 3 -- intervalo de polling do painel de monitoramento,
// centralizado aqui (nunca espalhado como numero magico pelas telas). Nao ha
// WebSocket/SSE na infraestrutura atual (auditoria da Fase 29): polling via
// React Query e o mecanismo mais simples que atende o requisito de
// "praticamente em tempo real" sem introduzir infraestrutura nova.
export const OPERATIONS_POLL_INTERVAL_MS = 10_000;
