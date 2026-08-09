import { ForbiddenException, Injectable } from '@nestjs/common';
import { TripStatus } from '@prisma/client';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { compact } from '../../common/utils/compact.util';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { haversineDistanceMeters } from '../../common/utils/geo.util';
import { assertOdometerNotBelowVehicle, computeBumpedOdometer } from '../../common/utils/odometer.util';
import { PrismaService } from '../../prisma/prisma.service';
import { TrackingPointsService } from '../../trip-operations/services/tracking-points.service';
import { TripEntity } from '../../trips/entities/trip.entity';
import { TripWithRelations } from '../../trips/mappers/trip.mapper';
import { TripsService } from '../../trips/services/trips.service';
import { DriverActiveTripEntity } from '../entities/driver-active-trip.entity';
import { DriverConfigEntity } from '../entities/driver-config.entity';
import { NearbyTollPlazaEntity } from '../entities/nearby-toll-plaza.entity';
import { StartTripDto } from '../dto/start-trip.dto';

// Estados que ainda precisam da atencao do motorista (Fase 25, secao 2):
// alem de ACTIVE/PAUSED (retomada), inclui os estados anteriores ao inicio
// (PLANNED/WAITING_DRIVER/WAITING_DEPARTURE) -- sem isso o app nao teria
// como o motorista descobrir que ha uma viagem despachada para ele iniciar.
// COMPLETED/CANCELLED ficam de fora (nada mais a fazer). Reaproveita
// TripStatus ja existente, nao inventa nenhum "TripOperationalState" novo.
const RELEVANT_STATUSES: TripStatus[] = [
  TripStatus.PLANNED,
  TripStatus.WAITING_DRIVER,
  TripStatus.WAITING_DEPARTURE,
  TripStatus.IN_PROGRESS,
  TripStatus.PAUSED,
];

@Injectable()
export class DriverTripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    private readonly trackingPointsService: TrackingPointsService,
  ) {}

  // GET /driver/trips/active -- unica fonte de verdade ao abrir o app.
  // Retorna null quando nao ha nenhuma viagem que precise de atencao (nunca
  // cria uma nova). O app decide a tela (iniciar x retomar) a partir do
  // campo `status` do retorno.
  async getActiveTrip(tenantId: string, driverId: string): Promise<DriverActiveTripEntity | null> {
    const trip = await this.prisma.trip.findFirst({
      where: { tenantId, driverId, deletedAt: null, status: { in: RELEVANT_STATUSES } },
      include: { destination: true, composition: { include: { vehicle: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!trip) {
      return null;
    }

    const lastLocation = await this.trackingPointsService.findLast(tenantId, trip.id);

    const entity = new DriverActiveTripEntity();
    entity.id = trip.id;
    entity.status = trip.status;
    entity.destinationName = trip.destination.name;
    entity.vehiclePlate = trip.composition?.vehicle.plate ?? null;
    entity.lastLocation = lastLocation
      ? { latitude: lastLocation.latitude, longitude: lastLocation.longitude, recordedAt: lastLocation.recordedAt }
      : null;
    entity.updatedAt = trip.updatedAt;
    return entity;
  }

  async getOne(tenantId: string, driverId: string, tripId: string): Promise<TripEntity> {
    await this.assertOwnedByDriver(tenantId, driverId, tripId);
    return this.tripsService.findOne(tenantId, tripId);
  }

  // PLANNED/WAITING_DRIVER/WAITING_DEPARTURE -> IN_PROGRESS. Idempotente: se
  // ja estiver IN_PROGRESS, nao ha erro (evita 409 por duplo toque no app).
  // KM/carga (Fase 27) so sao aplicados na largada de verdade -- um segundo
  // toque em "iniciar" com a viagem ja ACTIVE nunca sobrescreve o que ja foi
  // registrado.
  async start(
    tenantId: string,
    driverId: string,
    tripId: string,
    dto: StartTripDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    const trip = await this.assertOwnedByDriver(tenantId, driverId, tripId);
    if (trip.status !== TripStatus.IN_PROGRESS) {
      await this.applyStartDetails(trip, dto);
    }
    if (trip.status === TripStatus.IN_PROGRESS) {
      return this.tripsService.findOne(tenantId, tripId);
    }
    return this.tripsService.updateStatus(
      tenantId,
      tripId,
      { status: TripStatus.IN_PROGRESS },
      actor,
      metadata,
    );
  }

  // Grava loadStatus/initialOdometerKm na Trip (tela "INICIAR VIAGEM", Fase
  // 27, secao 2) e, quando informado, atualiza Vehicle.odometerKm se o valor
  // for maior que o atual -- mesma regra ja aplicada a abastecimentos
  // (common/utils/odometer.util.ts), nunca duplicada aqui.
  // initialOdometerKm NUNCA e sobrescrito depois de ja gravado (primeira
  // largada registrada vale para o historico da viagem toda).
  private async applyStartDetails(trip: TripWithRelations, dto: StartTripDto): Promise<void> {
    if (dto.odometerKm === undefined && dto.loadStatus === undefined) {
      return;
    }

    const vehicle = trip.composition?.vehicle ?? null;
    if (dto.odometerKm !== undefined && vehicle) {
      assertOdometerNotBelowVehicle(toNumberOrNull(vehicle.odometerKm), dto.odometerKm);
    }

    await this.prisma.trip.update({
      where: { id: trip.id },
      data: compact({
        loadStatus: dto.loadStatus,
        initialOdometerKm: trip.initialOdometerKm === null ? dto.odometerKm : undefined,
      }),
    });

    if (dto.odometerKm !== undefined && vehicle) {
      const bumped = computeBumpedOdometer(toNumberOrNull(vehicle.odometerKm), dto.odometerKm);
      if (bumped !== null) {
        await this.prisma.vehicle.update({ where: { id: vehicle.id }, data: { odometerKm: bumped } });
      }
    }
  }

  async pause(
    tenantId: string,
    driverId: string,
    tripId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    const trip = await this.assertOwnedByDriver(tenantId, driverId, tripId);
    if (trip.status === TripStatus.PAUSED) {
      return this.tripsService.findOne(tenantId, tripId);
    }
    return this.tripsService.updateStatus(
      tenantId,
      tripId,
      { status: TripStatus.PAUSED },
      actor,
      metadata,
    );
  }

  // Reabrir o app com a viagem ja ACTIVE tambem cai aqui (no-op) -- "retomar"
  // nao e so a transicao PAUSED->IN_PROGRESS, e tambem "continuar de onde
  // parou" sem exigir nenhuma transicao de estado.
  async resume(
    tenantId: string,
    driverId: string,
    tripId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    const trip = await this.assertOwnedByDriver(tenantId, driverId, tripId);
    if (trip.status === TripStatus.IN_PROGRESS) {
      return this.tripsService.findOne(tenantId, tripId);
    }
    return this.tripsService.updateStatus(
      tenantId,
      tripId,
      { status: TripStatus.IN_PROGRESS },
      actor,
      metadata,
    );
  }

  async complete(
    tenantId: string,
    driverId: string,
    tripId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripEntity> {
    const trip = await this.assertOwnedByDriver(tenantId, driverId, tripId);
    if (trip.status === TripStatus.COMPLETED) {
      return this.tripsService.findOne(tenantId, tripId);
    }
    return this.tripsService.updateStatus(
      tenantId,
      tripId,
      { status: TripStatus.COMPLETED },
      actor,
      metadata,
    );
  }

  async getConfig(tenantId: string): Promise<DriverConfigEntity> {
    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    const entity = new DriverConfigEntity();
    entity.gpsPingIntervalSeconds = settings?.gpsPingIntervalSeconds ?? 30;
    entity.stopDetectionMinutes = settings?.stopDetectionMinutes ?? 10;
    entity.stopRadiusMeters = settings?.stopRadiusMeters ?? 150;
    entity.tollProximityRadiusMeters = settings?.tollProximityRadiusMeters ?? 3000;
    return entity;
  }

  // GET /driver/trips/:id/nearby-toll-plazas -- so pracas da TollRoute
  // vinculada aquela viagem (corredor conhecido, Fase 23), nunca busca livre
  // no cadastro global. Distancia calculada em memoria (Haversine) a partir
  // de TollPlaza.latitude/longitude -- sem PostGIS/Google Maps.
  async getNearbyTollPlazas(
    tenantId: string,
    driverId: string,
    tripId: string,
    lat: number,
    lng: number,
  ): Promise<NearbyTollPlazaEntity[]> {
    await this.assertOwnedByDriver(tenantId, driverId, tripId);

    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId },
      include: {
        composition: { include: { axleConfiguration: true } },
        tollRoute: { include: { stops: { include: { tollPlaza: true } } } },
      },
    });
    if (!trip?.tollRoute) {
      return [];
    }

    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    const radiusMeters = settings?.tollProximityRadiusMeters ?? 3000;
    const defaultAxles = trip.composition?.axleConfiguration?.totalAxles ?? 0;

    return trip.tollRoute.stops
      .map((stop) => {
        const plazaLat = toNumberOrNull(stop.tollPlaza.latitude);
        const plazaLng = toNumberOrNull(stop.tollPlaza.longitude);
        if (plazaLat === null || plazaLng === null) {
          return null;
        }
        const distanceMeters = haversineDistanceMeters(
          { latitude: lat, longitude: lng },
          { latitude: plazaLat, longitude: plazaLng },
        );
        if (distanceMeters > radiusMeters) {
          return null;
        }
        const entity = new NearbyTollPlazaEntity();
        entity.tollPlazaId = stop.tollPlaza.id;
        entity.name = stop.tollPlaza.name;
        entity.highway = stop.tollPlaza.highway;
        entity.distanceMeters = Math.round(distanceMeters);
        entity.defaultAxles = defaultAxles;
        return entity;
      })
      .filter((entry): entry is NearbyTollPlazaEntity => entry !== null)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  // Valida a posse (trip.driverId === driverId autenticado) ANTES de
  // qualquer leitura/escrita -- nunca confia no :id da URL sozinho (regra
  // explicita da Fase 25, secao 21).
  private async assertOwnedByDriver(
    tenantId: string,
    driverId: string,
    tripId: string,
  ): Promise<TripWithRelations> {
    const trip = await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    if (trip.driverId !== driverId) {
      throw new ForbiddenException('Esta viagem nao pertence a este motorista.');
    }
    return trip;
  }
}
