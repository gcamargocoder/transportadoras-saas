// Guarda o access token SOMENTE em memoria (nunca localStorage/sessionStorage)
// para reduzir a janela de exposicao a XSS. E um singleton de modulo (fora do
// React) para que o cliente HTTP (services/api) consiga ler/renovar o token
// sem depender de contexto React -- o AuthProvider apenas sincroniza este
// singleton com o estado da aplicacao via setAccessToken/subscribe.
type Listener = (token: string | null) => void;

let currentToken: string | null = null;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return currentToken;
}

export function setAccessToken(token: string | null): void {
  currentToken = token;
  listeners.forEach((listener) => listener(token));
}

export function subscribeAccessToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Disparado quando um refresh falha (refresh token expirado/revogado/ausente)
// -- o AuthProvider escuta este evento para limpar a sessao e redirecionar
// ao /login, mesmo quando o 401 aconteceu fora de um componente React (ex:
// dentro de uma query do TanStack Query).
export const SESSION_EXPIRED_EVENT = 'transportadoras:session-expired';

export function emitSessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}
