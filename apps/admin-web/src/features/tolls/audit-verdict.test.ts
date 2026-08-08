import { describe, expect, it } from 'vitest';
import { computeTollAuditPreview } from './audit-verdict';

describe('computeTollAuditPreview', () => {
  it('retorna UNVERIFIABLE com mensagem quando a praça não tem tarifa cadastrada', () => {
    const result = computeTollAuditPreview(null, 6, 160);
    expect(result.verdict).toBe('UNVERIFIABLE');
    expect(result.expectedAmount).toBeNull();
    expect(result.message).toMatch(/não foi possível calcular/i);
  });

  it('retorna UNVERIFIABLE sem mensagem quando eixos/valor ainda não foram informados', () => {
    const result = computeTollAuditPreview(10, null, null);
    expect(result.verdict).toBe('UNVERIFIABLE');
    expect(result.message).toBeNull();
  });

  it('nunca inventa um valor esperado quando a tarifa é desconhecida', () => {
    const result = computeTollAuditPreview(null, 6, 500);
    expect(result.expectedAmount).toBeNull();
    expect(result.discrepancyAmount).toBeNull();
  });

  it('retorna OVERCHARGE quando cobrado > esperado', () => {
    const result = computeTollAuditPreview(10, 6, 90);
    expect(result.verdict).toBe('OVERCHARGE');
    expect(result.expectedAmount).toBe(60);
    expect(result.discrepancyAmount).toBe(30);
  });

  it('retorna UNDERCHARGE quando cobrado < esperado', () => {
    const result = computeTollAuditPreview(10, 6, 30);
    expect(result.verdict).toBe('UNDERCHARGE');
    expect(result.discrepancyAmount).toBe(-30);
  });

  it('retorna CORRECT quando cobrado == esperado', () => {
    const result = computeTollAuditPreview(10, 6, 60);
    expect(result.verdict).toBe('CORRECT');
    expect(result.discrepancyAmount).toBe(0);
  });

  it('retorna CORRECT para diferenças de centavos dentro da tolerância', () => {
    const result = computeTollAuditPreview(10, 6, 60.005);
    expect(result.verdict).toBe('CORRECT');
  });

  it('trata passagem isenta (cobrado = 0) com tarifa conhecida como CORRECT', () => {
    const result = computeTollAuditPreview(10, 6, 0);
    expect(result.verdict).toBe('CORRECT');
  });
});
