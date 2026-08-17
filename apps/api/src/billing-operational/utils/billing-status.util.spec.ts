import {
  computeBillingBalance,
  computeBillingStatusFromAmounts,
  resolveInvoiceAmount,
} from './billing-status.util';

describe('computeBillingStatusFromAmounts', () => {
  it('retorna DRAFT quando nao ha valor faturavel e nada foi faturado', () => {
    expect(computeBillingStatusFromAmounts(null, 0)).toBe('DRAFT');
  });

  it('retorna PARTIALLY_INVOICED quando o valor faturavel some (anomalo) mas ja havia faturamento', () => {
    expect(computeBillingStatusFromAmounts(null, 500)).toBe('PARTIALLY_INVOICED');
    expect(computeBillingStatusFromAmounts(0, 500)).toBe('PARTIALLY_INVOICED');
  });

  it('retorna READY quando ha valor faturavel e nada foi faturado ainda', () => {
    expect(computeBillingStatusFromAmounts(1000, 0)).toBe('READY');
  });

  it('retorna PARTIALLY_INVOICED quando faturado > 0 e < faturavel', () => {
    expect(computeBillingStatusFromAmounts(1000, 400)).toBe('PARTIALLY_INVOICED');
  });

  it('retorna INVOICED quando faturado atinge exatamente o faturavel', () => {
    expect(computeBillingStatusFromAmounts(1000, 1000)).toBe('INVOICED');
  });

  it('retorna INVOICED quando faturado supera o faturavel (nunca excede na pratica, mas a funcao e defensiva)', () => {
    expect(computeBillingStatusFromAmounts(1000, 1200)).toBe('INVOICED');
  });
});

describe('computeBillingBalance', () => {
  it('retorna null quando nao ha valor faturavel (nunca inventa saldo)', () => {
    expect(computeBillingBalance(null, 0)).toBeNull();
  });

  it('calcula o saldo como faturavel menos faturado', () => {
    expect(computeBillingBalance(1000, 400)).toBe(600);
  });

  it('saldo zero quando totalmente faturado', () => {
    expect(computeBillingBalance(1000, 1000)).toBe(0);
  });

  it('nunca retorna saldo negativo mesmo quando faturado excede o faturavel (estado anomalo)', () => {
    expect(computeBillingBalance(1000, 1500)).toBe(0);
  });
});

describe('resolveInvoiceAmount', () => {
  it('faturamento total: sem amount informado, usa o saldo inteiro', () => {
    const result = resolveInvoiceAmount(undefined, 1000);
    expect(result).toEqual({ ok: true, amount: 1000 });
  });

  it('faturamento parcial: amount informado menor que o saldo e aceito', () => {
    const result = resolveInvoiceAmount(400, 1000);
    expect(result).toEqual({ ok: true, amount: 400 });
  });

  it('faturamento parcial exatamente igual ao saldo e tratado como valido (equivale a total)', () => {
    const result = resolveInvoiceAmount(1000, 1000);
    expect(result).toEqual({ ok: true, amount: 1000 });
  });

  it('bloqueia excesso: amount maior que o saldo nunca e aceito', () => {
    const result = resolveInvoiceAmount(1500, 1000);
    expect(result).toEqual({ ok: false, reason: 'EXCEEDS_BALANCE' });
  });

  it('bloqueia valor invalido (zero ou negativo)', () => {
    expect(resolveInvoiceAmount(0, 1000)).toEqual({ ok: false, reason: 'INVALID_AMOUNT' });
    expect(resolveInvoiceAmount(-50, 1000)).toEqual({ ok: false, reason: 'INVALID_AMOUNT' });
  });

  it('idempotencia: quando o saldo ja e zero (totalmente faturado), qualquer nova tentativa e bloqueada', () => {
    const result = resolveInvoiceAmount(undefined, 0);
    expect(result).toEqual({ ok: false, reason: 'NO_BALANCE' });
  });

  it('idempotencia: mesmo pedindo um valor pequeno, saldo zero sempre bloqueia (nunca gera segunda receita)', () => {
    const result = resolveInvoiceAmount(10, 0);
    expect(result).toEqual({ ok: false, reason: 'NO_BALANCE' });
  });
});
