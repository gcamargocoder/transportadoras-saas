import { resolveRequirePreTripChecklist } from './trip-preferences.util';

describe('resolveRequirePreTripChecklist', () => {
  it('retorna false quando preferences e null/undefined', () => {
    expect(resolveRequirePreTripChecklist(null)).toBe(false);
    expect(resolveRequirePreTripChecklist(undefined)).toBe(false);
  });

  it('retorna false quando preferences nao e um objeto plano', () => {
    expect(resolveRequirePreTripChecklist('true')).toBe(false);
    expect(resolveRequirePreTripChecklist(['requirePreTripChecklist'])).toBe(false);
  });

  it('retorna false quando a chave esta ausente', () => {
    expect(resolveRequirePreTripChecklist({})).toBe(false);
  });

  it('retorna false quando a chave nao e exatamente true (nunca truthy generico)', () => {
    expect(resolveRequirePreTripChecklist({ requirePreTripChecklist: 'true' })).toBe(false);
    expect(resolveRequirePreTripChecklist({ requirePreTripChecklist: 1 })).toBe(false);
  });

  it('retorna true quando a chave e exatamente true', () => {
    expect(resolveRequirePreTripChecklist({ requirePreTripChecklist: true })).toBe(true);
  });
});
