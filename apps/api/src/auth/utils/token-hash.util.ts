import { createHash } from 'node:crypto';

// SHA-256, NAO Argon2: o refresh token ja e um JWT assinado de altissima
// entropia (nao e uma senha escolhida por humano), entao nao precisa de hash
// lento resistente a forca bruta. O hash aqui serve apenas para: (1) nao
// guardar o token em texto puro no banco e (2) permitir comparacao O(1) na
// rotacao/revogacao, sem custo de CPU por requisicao de refresh.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
