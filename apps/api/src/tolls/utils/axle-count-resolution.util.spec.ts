import { BadRequestException } from '@nestjs/common';
import { resolveAxleCount } from './axle-count-resolution.util';

describe('resolveAxleCount', () => {
  it('usa o valor informado explicitamente, mesmo havendo AxleEvent e padrao', () => {
    expect(
      resolveAxleCount({
        providedAxleCount: 5,
        matchingAxleEventDeclaredAxles: 7,
        defaultAxles: 9,
      }),
    ).toBe(5);
  });

  it('usa o declaredAxles do AxleEvent quando axleCount nao e informado (excecao 9->7)', () => {
    expect(
      resolveAxleCount({
        matchingAxleEventDeclaredAxles: 7,
        defaultAxles: 9,
      }),
    ).toBe(7);
  });

  it('usa o padrao da composicao quando nao ha axleCount informado nem AxleEvent', () => {
    expect(resolveAxleCount({ defaultAxles: 9 })).toBe(9);
  });

  it('lanca BadRequestException quando nao ha nenhuma fonte para resolver o valor', () => {
    expect(() => resolveAxleCount({})).toThrow(BadRequestException);
  });

  it('nunca altera o "padrao" -- apenas retorna um numero, e responsabilidade do chamador nao gravar isso em AxleConfiguration', () => {
    const result = resolveAxleCount({ matchingAxleEventDeclaredAxles: 7, defaultAxles: 9 });
    expect(result).toBe(7);
    expect(result).not.toBe(9);
  });
});
