import { ConflictException } from '@nestjs/common';
import { assertStorageUnderLimit, assertUnderLimit } from './plan-limit.util';

describe('plan-limit.util', () => {
  describe('assertUnderLimit', () => {
    it('libera quando o limite e null (sem limite configurado)', () => {
      expect(() => assertUnderLimit(1000, null, 'erro')).not.toThrow();
    });

    it('libera quando o limite e undefined', () => {
      expect(() => assertUnderLimit(1000, undefined, 'erro')).not.toThrow();
    });

    it('libera quando a contagem atual esta abaixo do limite', () => {
      expect(() => assertUnderLimit(5, 20, 'erro')).not.toThrow();
    });

    it('lanca ConflictException quando a contagem atual JA atingiu o limite', () => {
      expect(() => assertUnderLimit(20, 20, 'Limite de veiculos do plano atingido.')).toThrow(
        ConflictException,
      );
      expect(() => assertUnderLimit(20, 20, 'Limite de veiculos do plano atingido.')).toThrow(
        'Limite de veiculos do plano atingido.',
      );
    });

    it('lanca ConflictException quando a contagem atual ultrapassa o limite', () => {
      expect(() => assertUnderLimit(21, 20, 'erro')).toThrow(ConflictException);
    });

    it('libera quando o limite e zero e a contagem tambem e zero (0 >= 0 bloqueia -- limite zero nunca permite criar)', () => {
      expect(() => assertUnderLimit(0, 0, 'erro')).toThrow(ConflictException);
    });
  });

  describe('assertStorageUnderLimit', () => {
    const oneMb = 1024 * 1024;

    it('libera quando maxStorageMb e null (sem limite)', () => {
      expect(() => assertStorageUnderLimit(1000 * oneMb, oneMb, null, 'erro')).not.toThrow();
    });

    it('libera quando bytes atuais + incoming ficam dentro do limite', () => {
      expect(() => assertStorageUnderLimit(5 * oneMb, oneMb, 10, 'erro')).not.toThrow();
    });

    it('lanca ConflictException quando bytes atuais + incoming ultrapassam o limite', () => {
      expect(() => assertStorageUnderLimit(9.5 * oneMb, oneMb, 10, 'Limite de armazenamento do plano atingido.')).toThrow(
        ConflictException,
      );
    });

    it('libera quando o resultado e exatamente igual ao limite (nao ultrapassa)', () => {
      expect(() => assertStorageUnderLimit(9 * oneMb, oneMb, 10, 'erro')).not.toThrow();
    });
  });
});
