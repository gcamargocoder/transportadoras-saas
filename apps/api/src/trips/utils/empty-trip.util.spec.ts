import { buildDeliveryStopCountsByTrip, classifyEmptyTripReason } from './empty-trip.util';

describe('empty-trip.util', () => {
  describe('classifyEmptyTripReason', () => {
    it('NO_DELIVERIES_PLANNED quando nao ha nenhuma parada', () => {
      expect(classifyEmptyTripReason({ completed: 0, cancelled: 0, pending: 0, inProgress: 0 })).toBe(
        'NO_DELIVERIES_PLANNED',
      );
    });

    it('ALL_DELIVERIES_CANCELLED quando todas as paradas estao canceladas', () => {
      expect(classifyEmptyTripReason({ completed: 0, cancelled: 3, pending: 0, inProgress: 0 })).toBe(
        'ALL_DELIVERIES_CANCELLED',
      );
    });

    it('DELIVERIES_INCOMPLETE quando ha paradas nem concluidas nem todas canceladas', () => {
      expect(classifyEmptyTripReason({ completed: 0, cancelled: 1, pending: 2, inProgress: 0 })).toBe(
        'DELIVERIES_INCOMPLETE',
      );
      expect(classifyEmptyTripReason({ completed: 0, cancelled: 0, pending: 0, inProgress: 1 })).toBe(
        'DELIVERIES_INCOMPLETE',
      );
    });

    it('COMPLETED_DELIVERIES_INCONSISTENT quando ha parada concluida apesar de loadStatus=EMPTY', () => {
      expect(classifyEmptyTripReason({ completed: 1, cancelled: 0, pending: 0, inProgress: 0 })).toBe(
        'COMPLETED_DELIVERIES_INCONSISTENT',
      );
      expect(classifyEmptyTripReason({ completed: 2, cancelled: 3, pending: 1, inProgress: 0 })).toBe(
        'COMPLETED_DELIVERIES_INCONSISTENT',
      );
    });

    it('e deterministico -- mesma entrada sempre produz a mesma saida', () => {
      const counts = { completed: 0, cancelled: 2, pending: 0, inProgress: 0 };
      const results = Array.from({ length: 5 }, () => classifyEmptyTripReason(counts));
      expect(new Set(results).size).toBe(1);
    });
  });

  describe('buildDeliveryStopCountsByTrip', () => {
    it('agrega linhas de groupBy(tripId, status) numa unica passada, por viagem', () => {
      const map = buildDeliveryStopCountsByTrip([
        { tripId: 'trip-1', status: 'CANCELLED', _count: 2 },
        { tripId: 'trip-1', status: 'PENDING', _count: 1 },
        { tripId: 'trip-2', status: 'COMPLETED', _count: 1 },
      ]);

      expect(map.get('trip-1')).toEqual({ completed: 0, cancelled: 2, pending: 1, inProgress: 0 });
      expect(map.get('trip-2')).toEqual({ completed: 1, cancelled: 0, pending: 0, inProgress: 0 });
      expect(map.get('trip-3')).toBeUndefined();
    });

    it('viagem sem nenhuma linha simplesmente nao aparece no mapa (ausencia de dado, nunca zero inventado)', () => {
      const map = buildDeliveryStopCountsByTrip([]);
      expect(map.size).toBe(0);
    });
  });
});
