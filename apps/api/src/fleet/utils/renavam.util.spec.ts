import { isValidRenavam, normalizeRenavam } from './renavam.util';

describe('renavam.util', () => {
  describe('normalizeRenavam', () => {
    it('remove apenas espacos nas pontas', () => {
      expect(normalizeRenavam('  00123456789  ')).toBe('00123456789');
    });
  });

  describe('isValidRenavam', () => {
    it('aceita 11 digitos (padrao atual)', () => {
      expect(isValidRenavam('00123456789')).toBe(true);
    });

    it('aceita entre 9 e 11 digitos', () => {
      expect(isValidRenavam('123456789')).toBe(true);
    });

    it('rejeita menos de 9 digitos', () => {
      expect(isValidRenavam('12345678')).toBe(false);
    });

    it('rejeita mais de 11 digitos', () => {
      expect(isValidRenavam('123456789012')).toBe(false);
    });

    it('rejeita valor com letras', () => {
      expect(isValidRenavam('0012345678A')).toBe(false);
    });
  });
});
