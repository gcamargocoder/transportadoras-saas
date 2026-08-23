import { computeDriverShiftStatus, toDriverShiftEntity, toShiftBreakEntity } from './driver-shift.mapper';

describe('computeDriverShiftStatus', () => {
  it('OPEN quando nao ha endedAt nem cancelledAt', () => {
    expect(computeDriverShiftStatus({ endedAt: null, cancelledAt: null })).toBe('OPEN');
  });

  it('CLOSED quando ha endedAt e nenhum cancelledAt', () => {
    expect(computeDriverShiftStatus({ endedAt: new Date(), cancelledAt: null })).toBe('CLOSED');
  });

  it('CANCELLED quando ha cancelledAt, mesmo sem endedAt', () => {
    expect(computeDriverShiftStatus({ endedAt: null, cancelledAt: new Date() })).toBe('CANCELLED');
  });

  it('CANCELLED tem prioridade sobre CLOSED (jornada encerrada e depois cancelada)', () => {
    expect(computeDriverShiftStatus({ endedAt: new Date(), cancelledAt: new Date() })).toBe('CANCELLED');
  });
});

describe('toShiftBreakEntity', () => {
  it('durationMinutes nulo enquanto a pausa esta em curso', () => {
    const entity = toShiftBreakEntity({
      id: 'b1',
      driverShiftId: 's1',
      type: 'REST',
      startedAt: new Date('2026-09-01T10:00:00.000Z'),
      endedAt: null,
      reason: null,
    } as never);
    expect(entity.durationMinutes).toBeNull();
  });

  it('calcula durationMinutes quando a pausa esta encerrada', () => {
    const entity = toShiftBreakEntity({
      id: 'b1',
      driverShiftId: 's1',
      type: 'MEAL',
      startedAt: new Date('2026-09-01T10:00:00.000Z'),
      endedAt: new Date('2026-09-01T10:30:00.000Z'),
      reason: null,
    } as never);
    expect(entity.durationMinutes).toBe(30);
  });
});

describe('toDriverShiftEntity', () => {
  it('workedMinutes subtrai as pausas encerradas de durationMinutes', () => {
    const entity = toDriverShiftEntity({
      id: 's1',
      tenantId: 't1',
      driverId: 'd1',
      tripId: null,
      startedAt: new Date('2026-09-01T08:00:00.000Z'),
      endedAt: new Date('2026-09-01T10:00:00.000Z'),
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      breaks: [
        {
          id: 'b1',
          driverShiftId: 's1',
          type: 'MEAL',
          startedAt: new Date('2026-09-01T09:00:00.000Z'),
          endedAt: new Date('2026-09-01T09:30:00.000Z'),
          reason: null,
        },
      ],
    } as never);

    expect(entity.durationMinutes).toBe(120);
    expect(entity.workedMinutes).toBe(90);
  });

  it('durationMinutes e workedMinutes nulos enquanto a jornada esta aberta', () => {
    const entity = toDriverShiftEntity({
      id: 's1',
      tenantId: 't1',
      driverId: 'd1',
      tripId: null,
      startedAt: new Date('2026-09-01T08:00:00.000Z'),
      endedAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      breaks: [],
    } as never);

    expect(entity.durationMinutes).toBeNull();
    expect(entity.workedMinutes).toBeNull();
  });
});
