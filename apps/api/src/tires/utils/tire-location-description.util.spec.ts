import { TireLocationType } from '@prisma/client';
import { describeTireLocation, describeTireMovement } from './tire-location-description.util';

describe('tire-location-description.util', () => {
  describe('describeTireLocation', () => {
    it('retorna "Estoque" quando type e null ou STOCK', () => {
      expect(
        describeTireLocation({
          type: null,
          vehiclePlate: null,
          trailerPlate: null,
          position: null,
        }),
      ).toBe('Estoque');
      expect(
        describeTireLocation({
          type: TireLocationType.STOCK,
          vehiclePlate: null,
          trailerPlate: null,
          position: null,
        }),
      ).toBe('Estoque');
    });

    it('descreve veiculo com posicao', () => {
      const result = describeTireLocation({
        type: TireLocationType.VEHICLE,
        vehiclePlate: 'ABC1234',
        trailerPlate: null,
        position: 'Dianteiro Esquerdo',
      });
      expect(result).toBe('Veiculo ABC1234 (Dianteiro Esquerdo)');
    });

    it('descreve carreta sem posicao', () => {
      const result = describeTireLocation({
        type: TireLocationType.TRAILER,
        vehiclePlate: null,
        trailerPlate: 'XYZ9876',
        position: null,
      });
      expect(result).toBe('Carreta XYZ9876');
    });

    it('usa "?" quando a placa nao esta disponivel', () => {
      const result = describeTireLocation({
        type: TireLocationType.VEHICLE,
        vehiclePlate: null,
        trailerPlate: null,
        position: null,
      });
      expect(result).toBe('Veiculo ?');
    });
  });

  describe('describeTireMovement', () => {
    it('combina origem e destino com "->"', () => {
      const result = describeTireMovement(
        { type: TireLocationType.STOCK, vehiclePlate: null, trailerPlate: null, position: null },
        {
          type: TireLocationType.VEHICLE,
          vehiclePlate: 'ABC1234',
          trailerPlate: null,
          position: 'Tracao 1',
        },
      );
      expect(result).toBe('Estoque -> Veiculo ABC1234 (Tracao 1)');
    });
  });
});
