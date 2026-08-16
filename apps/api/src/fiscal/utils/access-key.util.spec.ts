import { normalizeAccessKey } from './access-key.util';

describe('normalizeAccessKey', () => {
  it('remove pontuacao/espacos e mantem so os digitos', () => {
    expect(normalizeAccessKey('3526 0812 3456 7800 0199 5500 1000 0012 3412 3456 7890')).toBe(
      '35260812345678000199550010000012341234567890',
    );
    expect(normalizeAccessKey('3526.0812.3456.7800.0199.5500.1000.0012.3412.3456.7890')).toBe(
      '35260812345678000199550010000012341234567890',
    );
  });

  it('retorna null quando o tamanho normalizado nao e 44 digitos (nunca trunca/completa)', () => {
    expect(normalizeAccessKey('123')).toBeNull();
    expect(normalizeAccessKey('3526081234567800019955001000001234123456789012345')).toBeNull(); // 51 digitos
  });

  it('retorna null para valores ausentes', () => {
    expect(normalizeAccessKey(null)).toBeNull();
    expect(normalizeAccessKey(undefined)).toBeNull();
    expect(normalizeAccessKey('')).toBeNull();
  });

  it('mantem uma chave ja normalizada de 44 digitos inalterada', () => {
    const key = '35260812345678000199550010000012341234567890';
    expect(normalizeAccessKey(key)).toBe(key);
  });
});
