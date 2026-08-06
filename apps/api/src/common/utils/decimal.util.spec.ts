import { Prisma } from '@prisma/client';
import { toNumberOrNull } from './decimal.util';

describe('toNumberOrNull', () => {
  it('converte um Prisma.Decimal para number', () => {
    expect(toNumberOrNull(new Prisma.Decimal('123.45'))).toBe(123.45);
  });

  it('retorna null para null', () => {
    expect(toNumberOrNull(null)).toBeNull();
  });

  it('retorna null para undefined', () => {
    expect(toNumberOrNull(undefined)).toBeNull();
  });
});
