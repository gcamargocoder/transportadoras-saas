import { VehicleIdleReason } from '@prisma/client';
import { FALLBACK_DEFAULT_IDLE_REASON, resolveDefaultIdleReason } from './default-idle-reason.util';

describe('resolveDefaultIdleReason (Fase B)', () => {
  it('fallback seguro quando preferences e null/undefined/nao-objeto', () => {
    expect(resolveDefaultIdleReason(null)).toBe(FALLBACK_DEFAULT_IDLE_REASON);
    expect(resolveDefaultIdleReason(undefined)).toBe(FALLBACK_DEFAULT_IDLE_REASON);
    expect(resolveDefaultIdleReason('x')).toBe(FALLBACK_DEFAULT_IDLE_REASON);
    expect(resolveDefaultIdleReason([1, 2])).toBe(FALLBACK_DEFAULT_IDLE_REASON);
  });

  it('fallback quando a chave esta ausente', () => {
    expect(resolveDefaultIdleReason({ outra: 'coisa' })).toBe(FALLBACK_DEFAULT_IDLE_REASON);
  });

  it('fallback quando o valor NAO e um VehicleIdleReason valido (nunca inventa)', () => {
    expect(resolveDefaultIdleReason({ defaultIdleReason: 'BANANA' })).toBe(FALLBACK_DEFAULT_IDLE_REASON);
    expect(resolveDefaultIdleReason({ defaultIdleReason: 42 })).toBe(FALLBACK_DEFAULT_IDLE_REASON);
  });

  it('usa o motivo configurado pelo tenant quando valido', () => {
    expect(resolveDefaultIdleReason({ defaultIdleReason: 'AGUARDANDO_CARGA' })).toBe(VehicleIdleReason.AGUARDANDO_CARGA);
    expect(resolveDefaultIdleReason({ defaultIdleReason: 'PATIO' })).toBe(VehicleIdleReason.PATIO);
  });

  it('o fallback e AGUARDANDO_ORDEM (nao OUTRO)', () => {
    expect(FALLBACK_DEFAULT_IDLE_REASON).toBe(VehicleIdleReason.AGUARDANDO_ORDEM);
  });
});
