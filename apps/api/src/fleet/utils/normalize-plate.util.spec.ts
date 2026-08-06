import { normalizePlate } from './normalize-plate.util';

describe('normalize-plate.util', () => {
  it('remove hifen e espacos, deixando maiusculo', () => {
    expect(normalizePlate('abc-1234')).toBe('ABC1234');
    expect(normalizePlate('ABC 1D23')).toBe('ABC1D23');
    expect(normalizePlate('abc1d23')).toBe('ABC1D23');
  });
});
