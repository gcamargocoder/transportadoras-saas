import { computeMaintenanceCostPerKmTotals } from './maintenance-cost-per-km.util';

describe('computeMaintenanceCostPerKmTotals', () => {
  it('retorna null (indisponivel) sem nenhum ponto', () => {
    expect(computeMaintenanceCostPerKmTotals([])).toBeNull();
  });

  it('retorna null quando nenhum veiculo tem >= 2 leituras de odometro', () => {
    const points = [
      { vehicleId: 'v1', odometerKm: 100000, totalCost: 500 },
      { vehicleId: 'v2', odometerKm: null, totalCost: 300 },
    ];
    expect(computeMaintenanceCostPerKmTotals(points)).toBeNull();
  });

  it('calcula distancia (maior - menor odometro) e soma custo do mesmo veiculo', () => {
    const points = [
      { vehicleId: 'v1', odometerKm: 100000, totalCost: 500 },
      { vehicleId: 'v1', odometerKm: 105000, totalCost: 300 },
    ];
    const result = computeMaintenanceCostPerKmTotals(points);
    expect(result).toEqual({ totalCost: 800, totalDistanceKm: 5000 });
  });

  it('soma segmentos de VARIOS veiculos antes de dividir (nunca media de razoes)', () => {
    const points = [
      { vehicleId: 'v1', odometerKm: 100000, totalCost: 500 },
      { vehicleId: 'v1', odometerKm: 105000, totalCost: 300 },
      { vehicleId: 'v2', odometerKm: 50000, totalCost: 200 },
      { vehicleId: 'v2', odometerKm: 60000, totalCost: 100 },
    ];
    const result = computeMaintenanceCostPerKmTotals(points);
    expect(result).toEqual({ totalCost: 1100, totalDistanceKm: 15000 });
  });

  it('exclui veiculo com so 1 leitura de odometro, mas mantem os demais (custo dele nunca conta)', () => {
    const points = [
      { vehicleId: 'v1', odometerKm: 100000, totalCost: 500 },
      { vehicleId: 'v1', odometerKm: 105000, totalCost: 300 },
      { vehicleId: 'v2', odometerKm: 50000, totalCost: 999 },
    ];
    const result = computeMaintenanceCostPerKmTotals(points);
    expect(result).toEqual({ totalCost: 800, totalDistanceKm: 5000 });
  });

  it('ignora registros sem odometerKm ao calcular distancia, mas nao quebra o calculo dos demais', () => {
    const points = [
      { vehicleId: 'v1', odometerKm: 100000, totalCost: 500 },
      { vehicleId: 'v1', odometerKm: null, totalCost: 50 },
      { vehicleId: 'v1', odometerKm: 105000, totalCost: 300 },
    ];
    const result = computeMaintenanceCostPerKmTotals(points);
    expect(result).toEqual({ totalCost: 850, totalDistanceKm: 5000 });
  });
});
