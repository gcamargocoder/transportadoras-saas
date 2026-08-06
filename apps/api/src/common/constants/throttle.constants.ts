// Presets nomeados e reutilizaveis para @Throttle(...). A chave 'default'
// tem que bater com o nome do throttler registrado em
// common/config/throttler.config.ts -- @Throttle({ default: {...} })
// SOBRESCREVE apenas o limite do throttler 'default' para aquela rota
// especifica, nunca soma um throttler novo.
//
// Preparado para customizacao futura: cada preset e um objeto isolado,
// entao ajustar/adicionar uma categoria (ex: THROTTLE_WEBHOOK) nao afeta
// as demais nem exige tocar nos controllers ja usando os presets existentes.
export const AUTH_LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
export const AUTH_REFRESH_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
export const AUTH_LOGOUT_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

// Endpoints administrativos: operacoes SUPER_ADMIN cross-tenant (ex: listar/
// editar/excluir qualquer transportadora da plataforma).
export const ADMIN_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

// Endpoints criticos: operacoes destrutivas (DELETE) sobre entidades de
// negocio.
export const CRITICAL_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
