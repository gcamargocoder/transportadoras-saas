import { describe, expect, it } from 'vitest';
import type { NotificationEntity } from '../../types/entities';
import { resolveNotificationLink } from './notification-links';

function buildNotification(overrides: Partial<NotificationEntity> = {}): NotificationEntity {
  return {
    id: 'n1',
    type: 'CRITICAL_OCCURRENCE',
    title: 'x',
    message: 'x',
    severity: 'CRITICAL',
    entityType: 'TripOccurrence',
    entityId: 'e1',
    metadata: null,
    readAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveNotificationLink', () => {
  it('TripOccurrence com tripId no metadata leva para /trips/:tripId', () => {
    const link = resolveNotificationLink(buildNotification({ metadata: { tripId: 'trip-1' } }));
    expect(link).toBe('/trips/trip-1');
  });

  it('TripOccurrence sem tripId no metadata nao tem link', () => {
    const link = resolveNotificationLink(buildNotification({ metadata: null }));
    expect(link).toBeNull();
  });

  it('Vehicle usa o proprio entityId', () => {
    const link = resolveNotificationLink(buildNotification({ entityType: 'Vehicle', entityId: 'veh-1' }));
    expect(link).toBe('/vehicles/veh-1');
  });

  it('Tire usa o proprio entityId (rota /tires/:id existe)', () => {
    const link = resolveNotificationLink(buildNotification({ entityType: 'Tire', entityId: 'tire-1' }));
    expect(link).toBe('/tires/tire-1');
  });

  it('Driver usa o proprio entityId', () => {
    const link = resolveNotificationLink(buildNotification({ entityType: 'Driver', entityId: 'drv-1' }));
    expect(link).toBe('/drivers/drv-1');
  });

  it('FiscalDocument sem tripId cai no dashboard fiscal geral', () => {
    const link = resolveNotificationLink(buildNotification({ entityType: 'FiscalDocument', metadata: null }));
    expect(link).toBe('/operations/fleet/fiscal');
  });

  // Fase 70 -- DELIVERY_PROOF_PENDING/PROBLEM usam entityType='FiscalDocument'
  // (mesmo comprovante, nunca uma segunda entidade) e sempre carregam
  // metadata.tripId (candidato filtra tripId!=null na origem).
  it('DELIVERY_PROOF_PENDING com tripId leva para /trips/:tripId (mesmo caminho de FiscalDocument)', () => {
    const link = resolveNotificationLink(
      buildNotification({ type: 'DELIVERY_PROOF_PENDING', entityType: 'FiscalDocument', metadata: { tripId: 'trip-2' } }),
    );
    expect(link).toBe('/trips/trip-2');
  });

  it('DELIVERY_PROOF_PROBLEM com tripId leva para /trips/:tripId', () => {
    const link = resolveNotificationLink(
      buildNotification({ type: 'DELIVERY_PROOF_PROBLEM', entityType: 'FiscalDocument', metadata: { tripId: 'trip-3' } }),
    );
    expect(link).toBe('/trips/trip-3');
  });

  // Fase 108 -- manutencao preventiva vencida/proxima sem OS aberta ainda.
  it('MaintenancePlan com vehicleId no metadata leva para /vehicles/:vehicleId', () => {
    const link = resolveNotificationLink(
      buildNotification({ entityType: 'MaintenancePlan', entityId: 'plan-1', metadata: { vehicleId: 'veh-2' } }),
    );
    expect(link).toBe('/vehicles/veh-2');
  });

  it('MaintenancePlan sem vehicleId no metadata nao tem link', () => {
    const link = resolveNotificationLink(buildNotification({ entityType: 'MaintenancePlan', metadata: null }));
    expect(link).toBeNull();
  });

  // Fase "Alertas de sincronizacao".
  it('TollDataSource leva para o painel de status do Super Admin, independente do entityId (id da execucao, sem tela propria)', () => {
    const link = resolveNotificationLink(
      buildNotification({ type: 'TOLL_DATA_SYNC_FAILURE', entityType: 'TollDataSource', entityId: 'run-1' }),
    );
    expect(link).toBe('/super-admin/toll-data');
  });

  it('entityType desconhecido nunca inventa uma URL', () => {
    const link = resolveNotificationLink(buildNotification({ entityType: 'SomethingUnknown' }));
    expect(link).toBeNull();
  });
});
