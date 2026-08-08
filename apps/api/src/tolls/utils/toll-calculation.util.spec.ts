import { TollTransactionStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import {
  classifyTollTransaction,
  computeAuditVerdict,
  computeDiscrepancy,
  computeExpectedAmount,
} from './toll-calculation.util';

describe('toll-calculation.util', () => {
  describe('computeExpectedAmount', () => {
    it('multiplica pricePerAxle pela quantidade de eixos', () => {
      expect(computeExpectedAmount(new Prisma.Decimal(10), 6)).toBe(60);
    });

    it('retorna 0 quando a praca nao tem pricePerAxle cadastrado', () => {
      expect(computeExpectedAmount(null, 6)).toBe(0);
    });
  });

  describe('computeDiscrepancy', () => {
    it('e positiva quando cobrado > esperado (cobranca acima)', () => {
      expect(computeDiscrepancy(160, 145)).toBe(15);
    });

    it('e negativa quando cobrado < esperado (cobranca abaixo)', () => {
      expect(computeDiscrepancy(100, 145)).toBe(-45);
    });

    it('e zero quando cobrado == esperado', () => {
      expect(computeDiscrepancy(60, 60)).toBe(0);
    });
  });

  describe('classifyTollTransaction (status gravado, nao alterado nesta fase)', () => {
    it('classifica como NORMAL dentro da tolerancia', () => {
      expect(classifyTollTransaction(60, 0)).toBe(TollTransactionStatus.NORMAL);
    });

    it('classifica como DIVERGENT fora da tolerancia', () => {
      expect(classifyTollTransaction(90, 30)).toBe(TollTransactionStatus.DIVERGENT);
    });

    it('classifica como EXEMPT quando o valor cobrado e zero', () => {
      expect(classifyTollTransaction(0, -60)).toBe(TollTransactionStatus.EXEMPT);
    });
  });

  describe('computeAuditVerdict (motor de conferencia, Fase 22)', () => {
    it('retorna UNVERIFIABLE com mensagem explicita quando a praca nao tem tarifa conhecida, mesmo com divergencia calculada', () => {
      const result = computeAuditVerdict(false, 160, 160);
      expect(result.verdict).toBe('UNVERIFIABLE');
      expect(result.message).toMatch(/nao foi possivel calcular/i);
    });

    it('nunca gera falso positivo de OVERCHARGE/UNDERCHARGE quando a tarifa e desconhecida', () => {
      // mesmo com uma divergencia grande, sem tarifa conhecida o veredito
      // tem que ser UNVERIFIABLE, nunca OVERCHARGE/UNDERCHARGE/CORRECT.
      const result = computeAuditVerdict(false, 500, 500);
      expect(result.verdict).toBe('UNVERIFIABLE');
    });

    it('retorna OVERCHARGE quando cobrado > esperado com tarifa conhecida', () => {
      const discrepancy = computeDiscrepancy(160, 145);
      const result = computeAuditVerdict(true, 160, discrepancy);
      expect(result.verdict).toBe('OVERCHARGE');
      expect(result.message).toBeNull();
    });

    it('retorna UNDERCHARGE quando cobrado < esperado com tarifa conhecida', () => {
      const discrepancy = computeDiscrepancy(100, 145);
      const result = computeAuditVerdict(true, 100, discrepancy);
      expect(result.verdict).toBe('UNDERCHARGE');
    });

    it('retorna CORRECT quando cobrado == esperado (dentro da tolerancia)', () => {
      const discrepancy = computeDiscrepancy(60, 60);
      const result = computeAuditVerdict(true, 60, discrepancy);
      expect(result.verdict).toBe('CORRECT');
    });

    it('retorna CORRECT para diferencas de centavos dentro da tolerancia', () => {
      const discrepancy = computeDiscrepancy(60.005, 60);
      const result = computeAuditVerdict(true, 60.005, discrepancy);
      expect(result.verdict).toBe('CORRECT');
    });

    it('trata passagem isenta (chargedAmount = 0) com tarifa conhecida como CORRECT', () => {
      const discrepancy = computeDiscrepancy(0, 0);
      const result = computeAuditVerdict(true, 0, discrepancy);
      expect(result.verdict).toBe('CORRECT');
    });
  });
});
