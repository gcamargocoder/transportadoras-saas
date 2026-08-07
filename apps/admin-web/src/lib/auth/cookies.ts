export const REFRESH_COOKIE_NAME = 'transportadoras_refresh_token';

// 30 dias: apenas o limite maximo do cookie no navegador. O backend
// (RefreshToken.expiresAt) e a autoridade real sobre validade/revogacao --
// este valor so evita reter o cookie indefinidamente no cliente.
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
