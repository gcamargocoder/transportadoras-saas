import { Injectable } from '@nestjs/common';

// Bloqueio TEMPORARIO por conta (tenantId+email) contra brute force -- o
// unico controle que existia antes desta fase era rate limit por IP
// (AUTH_LOGIN_THROTTLE, 10/min), que nao protege uma conta especifica de
// um ataque distribuido por IP ou prolongado no tempo.
//
// Deliberadamente in-memory (Map, sem Redis): nao ha nenhuma
// infraestrutura de storage compartilhado no projeto hoje (confirmado --
// so Postgres via docker-compose) e o ThrottlerGuard global ja aceita a
// mesma limitacao (in-memory, por instancia). Criar Redis so para isto
// seria infraestrutura nova sem necessidade comprovada -- documentado como
// limitacao real em docs/security-hardening.md (nao funciona corretamente
// com multiplas instancias da API rodando ao mesmo tempo).
//
// NUNCA bloqueio permanente: o lockout expira sozinho (LOCKOUT_MS). Uma vez
// bloqueado, tentativas adicionais sao rejeitadas SEM estender o lockout
// (isLocked() e sempre checado ANTES de recordFailure() em AuthService) --
// isso impede que um atacante consiga gerar um bloqueio indefinido contra
// uma conta legitima so continuando a tentar.
//
// A resposta ao cliente (AuthService) e IDENTICA esteja a conta bloqueada
// ou nao (401 generico) -- este servico nunca deve vazar o estado de
// bloqueio pela API.
interface AttemptState {
  count: number;
  firstFailureAt: number;
  lockedUntil: number | null;
}

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
// Teto de chaves rastreadas simultaneamente -- protege contra um atacante
// tentando esgotar memoria com tenantId+email aleatorios em massa. Evicta a
// entrada mais antiga (ordem de insercao do Map) quando excede o teto.
const MAX_TRACKED_KEYS = 5000;

@Injectable()
export class LoginProtectionService {
  private readonly attempts = new Map<string, AttemptState>();

  private key(tenantId: string, email: string): string {
    return `${tenantId}:${email.toLowerCase()}`;
  }

  isLocked(tenantId: string, email: string): boolean {
    const k = this.key(tenantId, email);
    const state = this.attempts.get(k);
    if (!state?.lockedUntil) return false;
    if (Date.now() >= state.lockedUntil) {
      // Lockout expirado -- limpa por completo (reseta a contagem tambem).
      this.attempts.delete(k);
      return false;
    }
    return true;
  }

  recordFailure(tenantId: string, email: string): void {
    const k = this.key(tenantId, email);
    const now = Date.now();
    let state = this.attempts.get(k);
    if (!state || now - state.firstFailureAt > ATTEMPT_WINDOW_MS) {
      state = { count: 0, firstFailureAt: now, lockedUntil: null };
    }
    state.count += 1;
    if (state.count >= MAX_ATTEMPTS) {
      state.lockedUntil = now + LOCKOUT_DURATION_MS;
    }
    this.attempts.set(k, state);
    this.evictOldestIfOverCapacity();
  }

  recordSuccess(tenantId: string, email: string): void {
    this.attempts.delete(this.key(tenantId, email));
  }

  private evictOldestIfOverCapacity(): void {
    if (this.attempts.size <= MAX_TRACKED_KEYS) return;
    const oldestKey = this.attempts.keys().next().value;
    if (oldestKey !== undefined) this.attempts.delete(oldestKey);
  }
}
