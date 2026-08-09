import { estimateTollAmount } from './toll-estimate.util';

describe('toll-estimate.util', () => {
  describe('estimateTollAmount', () => {
    it('multiplica pricePerAxle pelo numero de eixos (exemplo 9 eixos)', () => {
      expect(estimateTollAmount(15, 9)).toBe(135);
    });

    it('usa o axleCount efetivo quando ha excecao (7 em vez do padrao 9)', () => {
      expect(estimateTollAmount(15, 7)).toBe(105);
    });

    it('nunca retorna zero quando o preco e desconhecido -- retorna null', () => {
      expect(estimateTollAmount(null, 9)).toBeNull();
    });

    it('retorna null quando a quantidade de eixos e desconhecida', () => {
      expect(estimateTollAmount(15, null)).toBeNull();
    });

    it('arredonda para 2 casas decimais', () => {
      expect(estimateTollAmount(10.333, 3)).toBe(31);
      expect(estimateTollAmount(10.335, 3)).toBeCloseTo(31.01, 2);
    });
  });
});
