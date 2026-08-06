import { isValidCpf, normalizeCpf } from './cpf.util';

describe('cpf.util', () => {
  describe('normalizeCpf', () => {
    it('remove pontuacao, mantendo so digitos', () => {
      expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    });
  });

  describe('isValidCpf', () => {
    it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('aceita CPF valido: %s', (cpf) => {
      expect(isValidCpf(cpf)).toBe(true);
    });

    it('rejeita CPF com digito verificador errado', () => {
      expect(isValidCpf('529.982.247-26')).toBe(false);
    });

    it('rejeita sequencias obvias (todos os digitos iguais)', () => {
      expect(isValidCpf('111.111.111-11')).toBe(false);
      expect(isValidCpf('00000000000')).toBe(false);
    });

    it('rejeita CPF com tamanho errado', () => {
      expect(isValidCpf('123456789')).toBe(false);
      expect(isValidCpf('123456789012')).toBe(false);
    });

    it('rejeita valores nao numericos/vazios', () => {
      expect(isValidCpf('abc.def.ghi-jk')).toBe(false);
      expect(isValidCpf('')).toBe(false);
    });
  });
});
