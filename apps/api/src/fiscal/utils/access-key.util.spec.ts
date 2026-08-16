import {
  computeAccessKeyCheckDigit,
  getAccessKeyModelCode,
  getExpectedAccessKeyModelCode,
  isAccessKeyCheckDigitValid,
  normalizeAccessKey,
} from './access-key.util';

// Chave sintetica valida (44 digitos): cUF(2)+AAMM(4)+CNPJ(14)+modelo(2)+
// serie(3)+nNF(9)+tpEmis(1)+cNF(8) = 43 digitos + DV calculado.
function buildAccessKey(modelCode: string): string {
  const first43 = `35` + `2601` + `12345678000199` + modelCode + `001` + `000000001` + `1` + `12345678`;
  return first43 + String(computeAccessKeyCheckDigit(first43));
}

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

describe('isAccessKeyCheckDigitValid', () => {
  it('aceita uma chave com digito verificador (DV) correto', () => {
    const key = buildAccessKey('55');
    expect(isAccessKeyCheckDigitValid(key)).toBe(true);
  });

  it('rejeita quando o DV foi corrompido (ultimo digito trocado)', () => {
    const key = buildAccessKey('55');
    const wrongDigit = key[43] === '0' ? '1' : '0';
    const corrupted = key.slice(0, 43) + wrongDigit;
    expect(isAccessKeyCheckDigitValid(corrupted)).toBe(false);
  });

  it('rejeita chave com tamanho invalido', () => {
    expect(isAccessKeyCheckDigitValid('12345')).toBe(false);
    expect(isAccessKeyCheckDigitValid('a'.repeat(44))).toBe(false);
  });
});

describe('getAccessKeyModelCode / getExpectedAccessKeyModelCode', () => {
  it('extrai o codigo de modelo (posicoes 21-22) da chave', () => {
    expect(getAccessKeyModelCode(buildAccessKey('55'))).toBe('55');
    expect(getAccessKeyModelCode(buildAccessKey('57'))).toBe('57');
    expect(getAccessKeyModelCode(buildAccessKey('58'))).toBe('58');
  });

  it('retorna null para chave com tamanho invalido', () => {
    expect(getAccessKeyModelCode('123')).toBeNull();
  });

  it('mapeia NFE/CTE/MDFE para os codigos oficiais 55/57/58', () => {
    expect(getExpectedAccessKeyModelCode('NFE')).toBe('55');
    expect(getExpectedAccessKeyModelCode('CTE')).toBe('57');
    expect(getExpectedAccessKeyModelCode('MDFE')).toBe('58');
  });
});
