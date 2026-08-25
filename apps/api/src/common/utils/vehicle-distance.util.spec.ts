import { computeVehicleDistancesKm, sumVehicleDistancesKm } from './vehicle-distance.util';

describe('computeVehicleDistancesKm', () => {
  it('retorna mapa vazio sem pontos', () => {
    expect(computeVehicleDistancesKm([]).size).toBe(0);
  });

  it('exclui veiculo com menos de 2 leituras de odometro', () => {
    const result = computeVehicleDistancesKm([
      { vehicleId: 'v1', odometerKm: 100000 },
      { vehicleId: 'v2', odometerKm: null },
    ]);
    expect(result.size).toBe(0);
  });

  it('calcula distancia (maior - menor odometro) por veiculo', () => {
    const result = computeVehicleDistancesKm([
      { vehicleId: 'v1', odometerKm: 100000 },
      { vehicleId: 'v1', odometerKm: 105000 },
    ]);
    expect(result.get('v1')).toBe(5000);
  });

  it('pool de leituras de MULTIPLAS origens (ex: FuelSupply + VehicleMaintenance) para o mesmo veiculo', () => {
    const result = computeVehicleDistancesKm([
      { vehicleId: 'v1', odometerKm: 100000 }, // FuelSupply
      { vehicleId: 'v1', odometerKm: 102000 }, // VehicleMaintenance.odometerKm
      { vehicleId: 'v1', odometerKm: 108000 }, // VehicleMaintenance.completionOdometerKm
    ]);
    expect(result.get('v1')).toBe(8000);
  });

  it('ignora leituras nulas sem quebrar o calculo dos demais pontos do mesmo veiculo', () => {
    const result = computeVehicleDistancesKm([
      { vehicleId: 'v1', odometerKm: 100000 },
      { vehicleId: 'v1', odometerKm: null },
      { vehicleId: 'v1', odometerKm: 105000 },
    ]);
    expect(result.get('v1')).toBe(5000);
  });

  it('nunca inclui distancia <= 0 (odometros iguais ou inconsistentes)', () => {
    const result = computeVehicleDistancesKm([
      { vehicleId: 'v1', odometerKm: 100000 },
      { vehicleId: 'v1', odometerKm: 100000 },
    ]);
    expect(result.has('v1')).toBe(false);
  });
});

describe('sumVehicleDistancesKm', () => {
  it('retorna null quando nenhum veiculo tem distancia (nunca 0 falso)', () => {
    expect(sumVehicleDistancesKm([{ vehicleId: 'v1', odometerKm: 100000 }])).toBeNull();
  });

  it('soma a distancia de VARIOS veiculos', () => {
    const result = sumVehicleDistancesKm([
      { vehicleId: 'v1', odometerKm: 100000 },
      { vehicleId: 'v1', odometerKm: 105000 },
      { vehicleId: 'v2', odometerKm: 50000 },
      { vehicleId: 'v2', odometerKm: 60000 },
    ]);
    expect(result).toBe(15000);
  });
});
