import { Injectable } from '@nestjs/common';
import { Driver, Prisma, Vehicle } from '@prisma/client';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { resolveVehicleAvailability } from '../../fleet/services/vehicle-availability.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FleetOptimizationCandidateEntity,
  FleetOptimizationResultEntity,
} from '../entities/fleet-optimization.entity';
import { TripWithRelations } from '../mappers/trip.mapper';
import { NON_TERMINAL_STATUSES, TripsService } from './trips.service';

const COMPOSITION_INCLUDE = { vehicle: true, axleConfiguration: true } satisfies Prisma.TripCompositionInclude;
type CompositionWithVehicle = Prisma.TripCompositionGetPayload<{ include: typeof COMPOSITION_INCLUDE }>;

// Cap por lado ANTES do produto cartesiano (regra de performance -- nunca
// deixa a quantidade de pares crescer proporcionalmente ao tamanho da
// frota/equipe; 15x15 = no maximo 225 pares calculados em MEMORIA, nenhuma
// query adicional por par). A selecao atual da viagem e sempre incluida
// mesmo se ficar fora do corte de nenhum dos dois lados.
const CANDIDATE_POOL_SIZE = 15;
const MAX_RANKED_CANDIDATES = 10;

// Pontuacao ADITIVA e deterministica -- nunca ML/IA (regra explicita da
// Fase 90). Cada peso e documentado em docs/trip-optimization.md (secao
// "Calculo da pontuacao"), reflete apenas dados JA existentes no banco:
// SCORE_BASE_AVAILABLE: piso de quem passou em todos os criterios de
// disponibilidade (unico jeito de entrar no ranking).
// SCORE_CURRENT_ASSIGNMENT_MATCH: motorista com DriverVehicleAssignment
// ATUAL (Fase 61) para este veiculo -- sinal real de vinculo operacional
// existente, nunca inventado.
// SCORE_AXLE_CONFIG_PRESENT: composicao com AxleConfiguration definida --
// dado de qualidade que a viagem ja usa (calculo de pedagio, Fase 23/26),
// nunca comparado contra nenhum requisito da viagem (ela nao tem um).
const SCORE_BASE_AVAILABLE = 100;
const SCORE_CURRENT_ASSIGNMENT_MATCH = 20;
const SCORE_AXLE_CONFIG_PRESENT = 10;

interface CompositionInfo {
  compositionId: string;
  vehicle: Vehicle;
  totalAxles: number | null;
  hasAxleConfiguration: boolean;
  available: boolean;
  restrictions: string[];
}

interface DriverInfo {
  driver: Driver;
  available: boolean;
  restrictions: string[];
}

// Fase 90 -- camada de decisao "qual veiculo/motorista aplicar nesta viagem
// planejada". NUNCA aplica nada sozinha (regra 6): so calcula e explica.
// "Aplicar" e literalmente PATCH /trips/:id (TripsService.update), que ja
// (a) so aceita mudanca com a viagem em PLANNED (regra 7), e (b) ja
// revalida disponibilidade de motorista/veiculo/composicao no momento da
// escrita (regra 8) -- nenhum endpoint de aplicacao novo foi criado aqui de
// proposito, para nunca duplicar essa validacao critica ja testada.
@Injectable()
export class FleetOptimizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
  ) {}

  async analyze(tenantId: string, tripId: string): Promise<FleetOptimizationResultEntity> {
    const trip = await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    const limitations: string[] = [];

    const hasWindow = Boolean(trip.plannedDeparture && trip.plannedArrival);
    if (!hasWindow) {
      limitations.push(
        'Viagem sem data de partida/chegada prevista cadastrada -- conflito de agenda não pôde ser verificado.',
      );
    }
    const departure = trip.plannedDeparture;
    const arrival = trip.plannedArrival;

    // Lote 1/5: composicoes candidatas = livres no tenant OU a atual desta
    // viagem (garante que a selecao atual sempre entre na analise, mesmo
    // que tecnicamente "ocupada" -- por esta propria viagem).
    const compositions = await this.prisma.tripComposition.findMany({
      where: { tenantId, OR: [{ tripId: null }, { tripId }] },
      include: COMPOSITION_INCLUDE,
    });

    // Lote 2/5: motoristas candidatos = ativos no tenant.
    const drivers = await this.prisma.driver.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
    });

    const vehicleIds = [...new Set(compositions.map((c) => c.vehicleId))];
    const driverIds = drivers.map((d) => d.id);

    // Lote 3/5 e 4/5: conflitos de agenda em UMA query cada (nunca uma por
    // veiculo/motorista) -- mesma janela de sobreposicao ja usada por
    // TripsService.assertDriverAvailable/assertVehicleAvailable.
    const [vehicleConflicts, driverConflicts] = hasWindow
      ? await Promise.all([
          this.prisma.trip.findMany({
            where: {
              tenantId,
              deletedAt: null,
              status: { in: NON_TERMINAL_STATUSES },
              id: { not: tripId },
              plannedDeparture: { lt: arrival! },
              plannedArrival: { gt: departure! },
              composition: { vehicleId: { in: vehicleIds } },
            },
            select: { composition: { select: { vehicleId: true } } },
          }),
          this.prisma.trip.findMany({
            where: {
              tenantId,
              deletedAt: null,
              status: { in: NON_TERMINAL_STATUSES },
              id: { not: tripId },
              driverId: { in: driverIds },
              plannedDeparture: { lt: arrival! },
              plannedArrival: { gt: departure! },
            },
            select: { driverId: true },
          }),
        ])
      : [[], []];
    const vehiclesWithConflict = new Set(
      vehicleConflicts.map((t) => t.composition?.vehicleId).filter((id): id is string => Boolean(id)),
    );
    const driversWithConflict = new Set(
      driverConflicts.map((t) => t.driverId).filter((id): id is string => Boolean(id)),
    );

    // Lote 5/5: vinculo ATUAL motorista->veiculo (Fase 61), em uma unica
    // query -- sinal real de "motorista habitual", nunca inventado.
    const assignments = await this.prisma.driverVehicleAssignment.findMany({
      where: { tenantId, driverId: { in: driverIds }, endedAt: null },
      select: { driverId: true, vehicleId: true },
    });
    const currentVehicleByDriver = new Map(assignments.map((a) => [a.driverId, a.vehicleId]));

    const compositionInfos: CompositionInfo[] = compositions.map((c) =>
      this.evaluateComposition(c, vehiclesWithConflict),
    );
    const driverInfos: DriverInfo[] = drivers.map((d) => this.evaluateDriver(d, trip, driversWithConflict));

    const availableCompositions = compositionInfos.filter((c) => c.available);
    const availableDrivers = driverInfos.filter((d) => d.available);

    if (availableCompositions.length === 0) {
      limitations.push('Nenhuma composição de frota disponível para o período desta viagem.');
    }
    if (availableDrivers.length === 0) {
      limitations.push('Nenhum motorista disponível para o período desta viagem.');
    }

    const compositionPool = this.capPool(availableCompositions, CANDIDATE_POOL_SIZE, (c) => c.vehicle.plate);
    const driverPool = this.capPool(availableDrivers, CANDIDATE_POOL_SIZE, (d) => d.driver.name);

    const pairs: FleetOptimizationCandidateEntity[] = [];
    for (const composition of compositionPool) {
      for (const driver of driverPool) {
        pairs.push(this.buildCandidate(trip, composition, driver, currentVehicleByDriver));
      }
    }

    // Garante que a selecao ATUAL da viagem sempre aparece, mesmo se algum
    // dos dois lados ficou fora do corte de CANDIDATE_POOL_SIZE (ou ficou
    // indisponivel desde que a viagem foi criada).
    const currentComposition = compositionInfos.find((c) => c.compositionId === trip.composition?.id);
    const currentDriver = driverInfos.find((d) => d.driver.id === trip.driverId);
    if (currentComposition && currentDriver) {
      const existing = pairs.find(
        (p) => p.compositionId === currentComposition.compositionId && p.driverId === currentDriver.driver.id,
      );
      if (existing) {
        existing.isCurrentSelection = true;
      } else {
        pairs.push(this.buildCandidate(trip, currentComposition, currentDriver, currentVehicleByDriver, true));
      }
    }

    const availablePairs = pairs
      .filter((p) => p.available)
      .sort((a, b) => this.compareCandidates(a, b));
    availablePairs.forEach((p, index) => {
      p.rank = index + 1;
    });
    const unavailablePairs = pairs.filter((p) => !p.available);
    unavailablePairs.forEach((p) => {
      p.rank = null;
    });

    const ranked = availablePairs.slice(0, MAX_RANKED_CANDIDATES);
    const currentPair = [...availablePairs, ...unavailablePairs].find((p) => p.isCurrentSelection);
    if (currentPair && !ranked.includes(currentPair)) {
      ranked.push(currentPair);
    }

    const result = new FleetOptimizationResultEntity();
    result.tripId = tripId;
    result.generatedAt = new Date();
    result.candidates = ranked;
    result.availableCompositionsCount = availableCompositions.length;
    result.availableDriversCount = availableDrivers.length;
    result.totalCompositionsConsidered = compositionInfos.length;
    result.totalDriversConsidered = driverInfos.length;
    result.limitations = limitations;
    return result;
  }

  private evaluateComposition(
    composition: CompositionWithVehicle,
    vehiclesWithConflict: Set<string>,
  ): CompositionInfo {
    const restrictions: string[] = [];
    const vehicle = composition.vehicle;

    const statusAvailable = resolveVehicleAvailability(vehicle.status, false) !== 'UNAVAILABLE';
    if (!statusAvailable) {
      restrictions.push(`Veículo ${vehicle.plate}: indisponível (status ${vehicle.status}).`);
    }
    const hasConflict = vehiclesWithConflict.has(vehicle.id);
    if (hasConflict) {
      restrictions.push(`Veículo ${vehicle.plate}: já reservado em outra viagem no mesmo período.`);
    }
    const hasAxleConfiguration = Boolean(composition.axleConfiguration);
    if (!hasAxleConfiguration) {
      restrictions.push(`Composição do veículo ${vehicle.plate}: sem configuração de eixos cadastrada.`);
    }

    return {
      compositionId: composition.id,
      vehicle,
      totalAxles: composition.axleConfiguration?.totalAxles ?? vehicle.axleCount ?? null,
      hasAxleConfiguration,
      available: statusAvailable && !hasConflict,
      restrictions,
    };
  }

  private evaluateDriver(
    driver: Driver,
    trip: TripWithRelations,
    driversWithConflict: Set<string>,
  ): DriverInfo {
    const restrictions: string[] = [];

    if (!driver.isAvailable) {
      restrictions.push(`Motorista ${driver.name}: marcado como indisponível no cadastro.`);
    }
    const cnhExpired = trip.plannedDeparture ? driver.cnhExpiresAt < trip.plannedDeparture : false;
    if (cnhExpired) {
      restrictions.push(
        `Motorista ${driver.name}: CNH vence em ${driver.cnhExpiresAt.toISOString().slice(0, 10)}, ` +
          'antes da partida prevista.',
      );
    }
    const hasConflict = driversWithConflict.has(driver.id);
    if (hasConflict) {
      restrictions.push(`Motorista ${driver.name}: já possui outra viagem no mesmo período.`);
    }

    return {
      driver,
      available: driver.isAvailable && !cnhExpired && !hasConflict,
      restrictions,
    };
  }

  private buildCandidate(
    trip: TripWithRelations,
    composition: CompositionInfo,
    driver: DriverInfo,
    currentVehicleByDriver: Map<string, string>,
    isCurrentSelection = false,
  ): FleetOptimizationCandidateEntity {
    const hasCurrentDriverVehicleAssignment =
      currentVehicleByDriver.get(driver.driver.id) === composition.vehicle.id;
    const available = composition.available && driver.available;

    let score = 0;
    if (available) {
      score = SCORE_BASE_AVAILABLE;
      if (hasCurrentDriverVehicleAssignment) score += SCORE_CURRENT_ASSIGNMENT_MATCH;
      if (composition.hasAxleConfiguration) score += SCORE_AXLE_CONFIG_PRESENT;
    }

    const entity = new FleetOptimizationCandidateEntity();
    entity.compositionId = composition.compositionId;
    entity.vehicleId = composition.vehicle.id;
    entity.vehiclePlate = composition.vehicle.plate;
    entity.vehicleType = composition.vehicle.type;
    entity.vehicleCategory = composition.vehicle.category;
    entity.cargoCapacityKg = toNumberOrNull(composition.vehicle.cargoCapacityKg);
    entity.totalAxles = composition.totalAxles;
    entity.driverId = driver.driver.id;
    entity.driverName = driver.driver.name;
    entity.driverCnhCategory = driver.driver.cnhCategory;
    entity.vehicleAvailable = composition.available;
    entity.driverAvailable = driver.available;
    entity.available = available;
    entity.isCurrentSelection =
      isCurrentSelection ||
      (composition.compositionId === trip.composition?.id && driver.driver.id === trip.driverId);
    entity.hasCurrentDriverVehicleAssignment = hasCurrentDriverVehicleAssignment;
    entity.score = score;
    entity.rank = null;
    entity.restrictions = [...composition.restrictions, ...driver.restrictions];
    entity.justification = this.buildJustification(entity, hasCurrentDriverVehicleAssignment);
    return entity;
  }

  private buildJustification(
    candidate: FleetOptimizationCandidateEntity,
    hasCurrentDriverVehicleAssignment: boolean,
  ): string {
    if (!candidate.available) {
      return `Não disponível: ${candidate.restrictions.join(' ')}`.trim();
    }
    const reasons: string[] = ['Veículo e motorista disponíveis para o período da viagem.'];
    if (hasCurrentDriverVehicleAssignment) {
      reasons.push('Motorista já é o condutor habitual deste veículo.');
    }
    if (candidate.totalAxles !== null) {
      reasons.push('Composição com configuração de eixos cadastrada.');
    }
    return reasons.join(' ');
  }

  // Ordena por score desc; empate resolvido de forma determinística (placa
  // do veiculo, depois nome do motorista) -- nunca aleatorio.
  private compareCandidates(a: FleetOptimizationCandidateEntity, b: FleetOptimizationCandidateEntity): number {
    if (b.score !== a.score) return b.score - a.score;
    if (a.vehiclePlate !== b.vehiclePlate) return a.vehiclePlate.localeCompare(b.vehiclePlate);
    return a.driverName.localeCompare(b.driverName);
  }

  // Corte deterministico do lado (placa/nome asc) antes do produto
  // cartesiano -- nunca aleatorio, nunca dependente de ordem de insercao.
  private capPool<T>(items: T[], size: number, sortKey: (item: T) => string): T[] {
    return [...items].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).slice(0, size);
  }
}
