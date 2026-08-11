import { findAmbiguousAxleCounts } from './axle-category-ambiguity.util';

describe('findAmbiguousAxleCounts', () => {
  it('marca como ambiguo um axleCount que aparece em 2+ grupos distintos', () => {
    const result = findAmbiguousAxleCounts([
      { axleCount: 2, groupKey: 'simples' },
      { axleCount: 2, groupKey: 'dupla' },
      { axleCount: 9, groupKey: 'unica' },
    ]);
    expect(result.has(2)).toBe(true);
    expect(result.has(9)).toBe(false);
  });

  it('nao marca como ambiguo quando o mesmo grupo repete o mesmo axleCount (nao e uma colisao real)', () => {
    const result = findAmbiguousAxleCounts([
      { axleCount: 9, groupKey: 'unica' },
      { axleCount: 9, groupKey: 'unica' },
    ]);
    expect(result.has(9)).toBe(false);
  });

  it('ignora linhas com axleCount null', () => {
    const result = findAmbiguousAxleCounts([{ axleCount: null, groupKey: 'a' }, { axleCount: null, groupKey: 'b' }]);
    expect(result.size).toBe(0);
  });

  it('lista vazia devolve conjunto vazio', () => {
    expect(findAmbiguousAxleCounts([]).size).toBe(0);
  });
});
