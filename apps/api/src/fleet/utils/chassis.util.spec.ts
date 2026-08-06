import { isValidChassisNumber, normalizeChassisNumber } from './chassis.util';

describe('chassis.util', () => {
  describe('normalizeChassisNumber', () => {
    it('remove espacos nas pontas e converte para maiusculo', () => {
      expect(normalizeChassisNumber(' 9bwzzz377vt004251 ')).toBe('9BWZZZ377VT004251');
    });
  });

  describe('isValidChassisNumber', () => {
    it('aceita um VIN valido de 17 caracteres', () => {
      expect(isValidChassisNumber('9BWZZZ377VT004251')).toBe(true);
    });

    it('aceita minusculo (normaliza antes de validar)', () => {
      expect(isValidChassisNumber('9bwzzz377vt004251')).toBe(true);
    });

    it('rejeita menos de 17 caracteres', () => {
      expect(isValidChassisNumber('9BWZZZ377VT00425')).toBe(false);
    });

    it('rejeita mais de 17 caracteres', () => {
      expect(isValidChassisNumber('9BWZZZ377VT0042511')).toBe(false);
    });

    it('rejeita letras proibidas (I, O, Q)', () => {
      expect(isValidChassisNumber('9BWZZZ377VTOO4251')).toBe(false);
      expect(isValidChassisNumber('9BWZZZ377VTII4251')).toBe(false);
      expect(isValidChassisNumber('9BWZZZ377VTQQ4251')).toBe(false);
    });
  });
});
