import { ConflictException } from '@nestjs/common';
import { assertOdometerNotBelowVehicle, computeBumpedOdometer } from './odometer.util';

describe('assertOdometerNotBelowVehicle', () => {
  it('nao lanca quando o veiculo ainda nao tem odometro registrado', () => {
    expect(() => assertOdometerNotBelowVehicle(null, 100)).not.toThrow();
  });

  it('nao lanca quando o novo valor e maior que o atual', () => {
    expect(() => assertOdometerNotBelowVehicle(100, 150)).not.toThrow();
  });

  it('nao lanca quando o novo valor e igual ao atual', () => {
    expect(() => assertOdometerNotBelowVehicle(100, 100)).not.toThrow();
  });

  it('lanca ConflictException quando o novo valor e menor que o atual', () => {
    expect(() => assertOdometerNotBelowVehicle(200, 150)).toThrow(ConflictException);
  });
});

describe('computeBumpedOdometer', () => {
  it('retorna o novo valor quando o veiculo ainda nao tem odometro', () => {
    expect(computeBumpedOdometer(null, 100)).toBe(100);
  });

  it('retorna o novo valor quando ele e maior que o atual', () => {
    expect(computeBumpedOdometer(100, 150)).toBe(150);
  });

  it('retorna null quando o novo valor e igual ao atual (nada a atualizar)', () => {
    expect(computeBumpedOdometer(100, 100)).toBeNull();
  });

  it('retorna null quando o novo valor e menor que o atual', () => {
    expect(computeBumpedOdometer(100, 50)).toBeNull();
  });
});
