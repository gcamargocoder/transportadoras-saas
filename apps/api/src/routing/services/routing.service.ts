import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertSeverity, AlertType, Prisma, RouteEventType, RouteVersionReason, TripStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { TollRatesService } from '../../toll-data/services/toll-rates.service';
import { SelectRoutePlanDto } from '../dto/select-route-plan.dto';
import { DriverRouteEntity } from '../entities/driver-route.entity';
import { RoutePlanComparisonEntity } from '../entities/route-plan-comparison.entity';
import { RoutePlanTollEntity } from '../entities/route-plan-toll.entity';
import { RoutePlanEntity } from '../entities/route-plan.entity';
import { toRoutePlanEntity, RoutePlanWithTolls } from '../mappers/route-plan.mapper';
import { CalculatedRoute, RouteWaypoint, RoutingProviderPort } from '../providers/routing-provider.interface';
import { ROUTING_PROVIDER } from '../routing.constants';
import { decodePolyline } from '../utils/polyline.util';
import {
  cumulativeDistancesMeters,
  distanceFromOriginMeters,
  distanceToPolylineMeters,
} from '../utils/route-geometry.util';
import { computeRouteComparison } from '../utils/route-comparison.util';
import { discoverTollsAlongRoute, TollPlazaCandidate } from '../utils/toll-matching.util';
import { estimateTollAmount } from '../utils/toll-estimate.util';

const ROUTE_PLAN_INCLUDE = { tolls: true } satisfies Prisma.RoutePlanInclude;

type TripForRouting = Prisma.TripGetPayload<{
  include: {
    origin: true;
    destination: true;
    composition: { include: { vehicle: true; axleConfiguration: true } };
  };
}>;

@Injectable()
export class RoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ROUTING_PROVIDER) private readonly provider: RoutingProviderPort,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly tollRatesService: TollRatesService,
  ) {}

  // POST /trips/:id/route-plan -- calcula UMA rota (a "principal") e ja
  // seleciona como atual da viagem.
  async computePrimary(
    tenantId: string,
    tripId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<RoutePlanEntity> {
    const trip = await this.loadTripForRouting(tenantId, tripId);
    this.assertRouteWritable(trip);
    const [calculated] = await this.provider.calculateRoutes({
      origin: { label: this.originLabelOf(trip) },
      destination: { label: this.destinationLabelOf(trip) },
      computeAlternatives: false,
    });
    if (!calculated) {
      throw new NotFoundException('Nenhuma rota encontrada entre a origem e o destino informados.');
    }

    const routePlan = await this.persistRoutePlan(tenantId, trip, calculated, RouteVersionReason.INITIAL);
    await this.setCurrentRoutePlan(tenantId, tripId, routePlan.id);

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'route_plan.computed',
      entityName: 'RoutePlan',
      entityId: routePlan.id,
      newValue: toJsonSafe({
        tripId,
        distanceMeters: routePlan.distanceMeters,
        durationSeconds: routePlan.durationSeconds,
        tollCount: routePlan.tolls.length,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toRoutePlanEntity(routePlan, true);
  }

  // POST /trips/:id/route-plan/alternatives -- calcula ate N rotas (o
  // provider decide quantas). Todas ficam persistidas (historico de opcoes
  // oferecidas); nenhuma delas passa a ser a atual automaticamente, EXCETO
  // quando a viagem ainda nao tinha nenhuma RoutePlan (nunca deixa a viagem
  // sem nenhuma rota selecionavel).
  async computeAlternatives(
    tenantId: string,
    tripId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<RoutePlanEntity[]> {
    const trip = await this.loadTripForRouting(tenantId, tripId);
    this.assertRouteWritable(trip);
    const calculatedRoutes = await this.provider.calculateRoutes({
      origin: { label: this.originLabelOf(trip) },
      destination: { label: this.destinationLabelOf(trip) },
      computeAlternatives: true,
    });
    if (calculatedRoutes.length === 0) {
      throw new NotFoundException('Nenhuma rota encontrada entre a origem e o destino informados.');
    }

    const routePlans: RoutePlanWithTolls[] = [];
    for (const calculated of calculatedRoutes) {
      routePlans.push(await this.persistRoutePlan(tenantId, trip, calculated, RouteVersionReason.INITIAL));
    }

    let currentId = trip.routePlanId;
    if (!currentId) {
      currentId = routePlans[0]!.id;
      await this.setCurrentRoutePlan(tenantId, tripId, currentId);
    }

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'route_plan.alternatives_computed',
      entityName: 'Trip',
      entityId: tripId,
      newValue: toJsonSafe({ count: routePlans.length, routePlanIds: routePlans.map((r) => r.id) }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return routePlans.map((routePlan) => toRoutePlanEntity(routePlan, routePlan.id === currentId));
  }

  // POST /trips/:id/route-plan/select
  async select(
    tenantId: string,
    tripId: string,
    dto: SelectRoutePlanDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<RoutePlanEntity> {
    const trip = await this.assertTripExists(tenantId, tripId);
    this.assertRouteWritable(trip);

    const routePlan = await this.prisma.routePlan.findFirst({
      where: { id: dto.routePlanId, tenantId, tripId },
      include: ROUTE_PLAN_INCLUDE,
    });
    if (!routePlan) {
      throw new NotFoundException('Rota planejada (routePlanId) nao encontrada para esta viagem.');
    }

    await this.setCurrentRoutePlan(tenantId, tripId, routePlan.id);

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'route_plan.selected',
      entityName: 'Trip',
      entityId: tripId,
      newValue: toJsonSafe({ routePlanId: routePlan.id }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toRoutePlanEntity(routePlan, true);
  }

  // GET /trips/:id/route-plan (e GET /driver/trips/:id/route, por baixo)
  async getCurrent(tenantId: string, tripId: string): Promise<RoutePlanEntity | null> {
    const trip = await this.assertTripExists(tenantId, tripId);
    if (!trip.routePlanId) return null;

    const routePlan = await this.prisma.routePlan.findFirst({
      where: { id: trip.routePlanId, tenantId },
      include: ROUTE_PLAN_INCLUDE,
    });
    return routePlan ? toRoutePlanEntity(routePlan, true) : null;
  }

  // GET /trips/:id/route-plan/tolls
  async getTolls(tenantId: string, tripId: string): Promise<RoutePlanTollEntity[]> {
    const current = await this.getCurrent(tenantId, tripId);
    return current?.tolls ?? [];
  }

  // Fase 89 -- sinal PURAMENTE informativo (nunca usado para decidir se um
  // calculo pode ser tentado por outro modulo): reaproveitado por
  // TripRoutingService para explicar ao usuario, na sugestao de sequencia de
  // paradas, se esta instalacao tem um provider de mapas configurado ou nao
  // -- mesmo binding ja resolvido em routing.module.ts, nunca uma segunda
  // leitura de env var.
  isProviderConfigured(): boolean {
    return this.provider.isConfigured();
  }

  // GET /driver/trips/:id/route -- visao MINIMA para o app do motorista
  // (secao 19 da Fase 26: destino, proximo pedagio, distancia). Nunca expoe
  // a RoutePlanEntity administrativa inteira.
  async getDriverView(tenantId: string, tripId: string): Promise<DriverRouteEntity | null> {
    const trip = await this.assertTripExists(tenantId, tripId);
    if (!trip.routePlanId) return null;

    const routePlan = await this.prisma.routePlan.findFirst({
      where: { id: trip.routePlanId, tenantId },
      include: ROUTE_PLAN_INCLUDE,
    });
    if (!routePlan) return null;

    const lastPoint = await this.prisma.trackingPoint.findFirst({
      where: { tenantId, tripId },
      orderBy: { recordedAt: 'desc' },
    });

    const sortedTolls = routePlan.tolls.slice().sort((a, b) => a.sequence - b.sequence);
    let distanceRemainingMeters: number | null = null;
    let nextTollSource: RoutePlanWithTolls['tolls'][number] | undefined;
    let nextTollDistanceMeters = 0;

    if (lastPoint) {
      const polyline = decodePolyline(routePlan.encodedPolyline);
      const cumulative = cumulativeDistancesMeters(polyline);
      const currentDistance = distanceFromOriginMeters(
        { latitude: lastPoint.latitude.toNumber(), longitude: lastPoint.longitude.toNumber() },
        polyline,
        cumulative,
      );
      distanceRemainingMeters = Math.max(0, Math.round(routePlan.distanceMeters - currentDistance));
      nextTollSource = sortedTolls.find((toll) => toll.distanceFromOriginMeters >= currentDistance);
      nextTollDistanceMeters = nextTollSource
        ? Math.max(0, Math.round(nextTollSource.distanceFromOriginMeters - currentDistance))
        : 0;
    } else {
      nextTollSource = sortedTolls[0];
      nextTollDistanceMeters = nextTollSource?.distanceFromOriginMeters ?? 0;
    }

    const hasUnresolvedDeviation = Boolean(
      await this.prisma.routeEvent.findFirst({
        where: { tenantId, tripId, type: RouteEventType.DEVIATION, resolvedAt: null },
      }),
    );

    return {
      destinationLabel: routePlan.destinationLabel,
      distanceMeters: routePlan.distanceMeters,
      durationSeconds: routePlan.durationSeconds,
      distanceRemainingMeters,
      nextToll: nextTollSource
        ? {
            name: nextTollSource.name,
            distanceMeters: nextTollDistanceMeters,
            defaultAxles: nextTollSource.axleCountUsed ?? routePlan.axleCountUsed ?? 0,
          }
        : null,
      tollCount: routePlan.tolls.length,
      totalTollAmount: toNumberOrNull(routePlan.totalTollAmount),
      hasUnresolvedDeviation,
    };
  }

  // POST /trips/:id/route-plan/recalculate (e POST /driver/trips/:id/route/recalculate)
  // -- usa a ULTIMA posicao de GPS conhecida como origem (se houver), mantem
  // o destino original, calcula uma rota nova e a torna a atual. NUNCA cria
  // uma nova viagem. Resolve automaticamente um RouteEvent de desvio ainda
  // aberto, se houver (ver checkDeviation).
  async recalculate(
    tenantId: string,
    tripId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<RoutePlanComparisonEntity> {
    const result = await this.performRecalculation(tenantId, tripId);

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'route_plan.recalculated',
      entityName: 'RoutePlan',
      entityId: result.nextRoutePlan.id,
      previousValue: result.previousRoutePlan ? toJsonSafe({ routePlanId: result.previousRoutePlan.id }) : null,
      newValue: toJsonSafe({ routePlanId: result.nextRoutePlan.id, difference: result.difference }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return {
      previous: result.previousRoutePlan ? toRoutePlanEntity(result.previousRoutePlan, false) : null,
      next: toRoutePlanEntity(result.nextRoutePlan, true),
      difference: result.difference,
    };
  }

  // Nucleo do calculo de recalculo, reaproveitado tanto pelo endpoint manual
  // (recalculate(), acima) quanto pelo recalculo automatico apos desvio
  // (checkDeviation(), abaixo, Fase 30 secao 4) -- a MESMA logica de rota,
  // nunca duplicada; so o registro de auditoria (que exige um ator humano)
  // fica de fora, decidido por cada chamador.
  private async performRecalculation(
    tenantId: string,
    tripId: string,
  ): Promise<{
    previousRoutePlan: RoutePlanWithTolls | null;
    nextRoutePlan: RoutePlanWithTolls;
    difference: ReturnType<typeof computeRouteComparison> | null;
  }> {
    const trip = await this.loadTripForRouting(tenantId, tripId);
    this.assertRouteWritable(trip);

    const previousRoutePlan = trip.routePlanId
      ? await this.prisma.routePlan.findFirst({
          where: { id: trip.routePlanId, tenantId },
          include: ROUTE_PLAN_INCLUDE,
        })
      : null;

    const lastPoint = await this.prisma.trackingPoint.findFirst({
      where: { tenantId, tripId },
      orderBy: { recordedAt: 'desc' },
    });

    // latitude/longitude sao campos obrigatorios em TrackingPoint/RoutePlan --
    // .toNumber() direto (Decimal do Prisma), sem passar por toNumberOrNull
    // (que existe para campos opcionais e devolveria number|null, incompativel
    // com RouteWaypoint sob exactOptionalPropertyTypes).
    const origin: RouteWaypoint = lastPoint
      ? {
          label: 'Posicao atual',
          latitude: lastPoint.latitude.toNumber(),
          longitude: lastPoint.longitude.toNumber(),
        }
      : { label: this.originLabelOf(trip) };

    const destination: RouteWaypoint = previousRoutePlan
      ? {
          label: previousRoutePlan.destinationLabel,
          latitude: previousRoutePlan.destinationLatitude.toNumber(),
          longitude: previousRoutePlan.destinationLongitude.toNumber(),
        }
      : { label: this.destinationLabelOf(trip) };

    const [calculated] = await this.provider.calculateRoutes({
      origin,
      destination,
      computeAlternatives: false,
    });
    if (!calculated) {
      throw new NotFoundException('Nenhuma rota encontrada a partir da posicao atual.');
    }

    const nextRoutePlan = await this.persistRoutePlan(tenantId, trip, calculated, RouteVersionReason.DEVIATION);
    await this.setCurrentRoutePlan(tenantId, tripId, nextRoutePlan.id);

    const openDeviation = await this.prisma.routeEvent.findFirst({
      where: { tenantId, tripId, type: RouteEventType.DEVIATION, resolvedAt: null },
    });
    if (openDeviation) {
      await this.prisma.routeEvent.update({
        where: { id: openDeviation.id },
        data: { resolvedAt: new Date(), resultingRoutePlanId: nextRoutePlan.id },
      });
    }

    const difference = previousRoutePlan
      ? computeRouteComparison(
          {
            distanceMeters: previousRoutePlan.distanceMeters,
            durationSeconds: previousRoutePlan.durationSeconds,
            tollCount: previousRoutePlan.tolls.length,
            totalTollAmount: toNumberOrNull(previousRoutePlan.totalTollAmount),
          },
          {
            distanceMeters: nextRoutePlan.distanceMeters,
            durationSeconds: nextRoutePlan.durationSeconds,
            tollCount: nextRoutePlan.tolls.length,
            totalTollAmount: toNumberOrNull(nextRoutePlan.totalTollAmount),
          },
        )
      : null;

    return { previousRoutePlan, nextRoutePlan, difference };
  }

  // Chamado por TrackingPointsService apos inserir um lote de localizacoes
  // (Fase 26/30) -- detecta e registra o desvio (RouteEvent + Alert,
  // reaproveitando AlertType.ROUTE_DEVIATION). A partir da Fase 30, secao 4,
  // tambem recalcula automaticamente (reaproveita performRecalculation(), o
  // MESMO nucleo do endpoint manual de recalculo) -- o motorista nao precisa
  // confirmar nada; o botao manual "Recalcular rota" continua existindo como
  // fallback. Idempotente: nao abre um segundo RouteEvent nem recalcula de
  // novo enquanto o anterior nao for resolvido.
  async checkDeviation(tenantId: string, tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId, deletedAt: null } });
    if (!trip?.routePlanId) return;

    const routePlan = await this.prisma.routePlan.findFirst({ where: { id: trip.routePlanId, tenantId } });
    if (!routePlan) return;

    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    const maxDeviationMeters = settings?.maxDeviationMeters ?? 500;
    const routeDeviationMinutes = settings?.routeDeviationMinutes ?? 5;

    const windowStart = new Date(Date.now() - routeDeviationMinutes * 60_000);
    const recentPoints = await this.prisma.trackingPoint.findMany({
      where: { tenantId, tripId, recordedAt: { gte: windowStart } },
      orderBy: { recordedAt: 'asc' },
    });
    if (recentPoints.length === 0) return;

    // "Sustentado" = a janela observada precisa cobrir de fato pelo menos
    // routeDeviationMinutes (nunca alertar por 1-2 pontos logo no inicio).
    const spanMinutes =
      (recentPoints[recentPoints.length - 1]!.recordedAt.getTime() -
        recentPoints[0]!.recordedAt.getTime()) /
      60_000;
    if (spanMinutes < routeDeviationMinutes) return;

    const polyline = decodePolyline(routePlan.encodedPolyline);
    const allPointsOffRoute = recentPoints.every((point) => {
      const distance = distanceToPolylineMeters(
        {
          latitude: toNumberOrNull(point.latitude) ?? 0,
          longitude: toNumberOrNull(point.longitude) ?? 0,
        },
        polyline,
      );
      return distance > maxDeviationMeters;
    });
    if (!allPointsOffRoute) return;

    const alreadyOpen = await this.prisma.routeEvent.findFirst({
      where: { tenantId, tripId, type: RouteEventType.DEVIATION, resolvedAt: null },
    });
    if (alreadyOpen) return;

    const routeEvent = await this.prisma.routeEvent.create({
      data: { tenantId, tripId, type: RouteEventType.DEVIATION },
    });
    await this.prisma.alert.create({
      data: {
        tenantId,
        tripId,
        routeEventId: routeEvent.id,
        type: AlertType.ROUTE_DEVIATION,
        severity: AlertSeverity.MEDIUM,
        message: `Veiculo fora da rota planejada ha mais de ${routeDeviationMinutes} minutos.`,
      },
    });

    // Recalculo automatico (Fase 30, secao 4) -- best-effort: se o provider
    // estiver indisponivel ou qualquer outra falha ocorrer, o desvio ja
    // registrado acima permanece valido e o motorista/escritorio ainda podem
    // recalcular manualmente depois. Nunca propaga o erro (o chamador,
    // TrackingPointsService.createBatch, tambem nao pode falhar por causa
    // disso).
    try {
      const result = await this.performRecalculation(tenantId, tripId);
      await this.audit.log({
        tenantId,
        userId: null,
        action: 'route_plan.auto_recalculated',
        entityName: 'RoutePlan',
        entityId: result.nextRoutePlan.id,
        previousValue: result.previousRoutePlan
          ? toJsonSafe({ routePlanId: result.previousRoutePlan.id })
          : null,
        newValue: toJsonSafe({ routePlanId: result.nextRoutePlan.id, difference: result.difference }),
        ipAddress: null,
        userAgent: 'system:auto-recalculation',
      });
    } catch {
      // best-effort -- ver comentario acima.
    }
  }

  // ==========================================================================
  // privados
  // ==========================================================================

  private async persistRoutePlan(
    tenantId: string,
    trip: TripForRouting,
    calculated: CalculatedRoute,
    reason: RouteVersionReason,
  ): Promise<RoutePlanWithTolls> {
    const axleCountUsed = trip.composition?.axleConfiguration?.totalAxles ?? null;
    const polyline = decodePolyline(calculated.encodedPolyline);
    const toleranceMeters = this.configService.get('routing', { infer: true }).tollMatchRadiusMeters;

    const candidates = await this.loadTollPlazaCandidates();
    const discovered = discoverTollsAlongRoute(polyline, candidates, toleranceMeters);
    const candidatesById = new Map(candidates.map((c) => [c.id, c]));

    // Fase 33, secao 16/17 -- prefere a tarifa oficial versionada do
    // catalogo (TollRate, via getEffectiveTariffsForAxleCount) quando ela
    // existir para a praca+eixos+data da rota; cai para a formula
    // pricePerAxle*eixos (Fase 26) so quando NAO ha tarifa oficial vigente.
    // Nunca duplica regra de negocio: a decisao de qual tarifa vale numa
    // data e sempre da resolveEffectiveTollTariff (util puro), nunca
    // reimplementada aqui. estimatedAmount continua sendo PREVISAO -- nunca
    // confundido com TollTransaction.
    const officialTariffs =
      axleCountUsed !== null
        ? await this.tollRatesService.getEffectiveTariffsForAxleCount(
            discovered.map((toll) => toll.tollPlazaId),
            axleCountUsed,
            new Date(),
          )
        : new Map();

    const tollsData = discovered.map((toll) => {
      const candidate = candidatesById.get(toll.tollPlazaId)!;
      const officialTariff = officialTariffs.get(toll.tollPlazaId);
      const estimatedAmount =
        officialTariff?.price ?? estimateTollAmount(candidate.pricePerAxle, axleCountUsed);
      return {
        tenantId,
        tollPlazaId: toll.tollPlazaId,
        sequence: toll.sequence,
        latitude: toll.latitude,
        longitude: toll.longitude,
        name: toll.name,
        distanceFromOriginMeters: toll.distanceFromOriginMeters,
        estimatedAmount,
        currency: officialTariff?.currency ?? calculated.estimatedTollCurrency ?? 'BRL',
        axleCountUsed,
        matchStatus: 'MATCHED' as const,
        matchConfidence: toll.matchConfidence,
        source: 'TOLL_PLAZA_MATCH',
        metadata: {
          distanceToRouteMeters: toll.distanceToRouteMeters,
          tariffSource: officialTariff?.price !== null && officialTariff?.price !== undefined
            ? 'OFFICIAL_CATALOG'
            : 'PRICE_PER_AXLE_FORMULA',
          officialTollRateId: officialTariff?.rateId ?? null,
        },
      };
    });

    const matchedTotal = tollsData.reduce((sum, t) => sum + (t.estimatedAmount ?? 0), 0);
    const hasAnyEstimate = tollsData.some((t) => t.estimatedAmount !== null);

    let totalTollAmount: number | null;
    let tollEstimateSource: 'MATCHED_PLAZAS' | 'PROVIDER_AGGREGATE' | 'NONE';
    if (tollsData.length > 0 && hasAnyEstimate) {
      totalTollAmount = Math.round(matchedTotal * 100) / 100;
      tollEstimateSource = 'MATCHED_PLAZAS';
    } else if (calculated.hasTolls && calculated.estimatedTollAmount !== null) {
      totalTollAmount = calculated.estimatedTollAmount;
      tollEstimateSource = 'PROVIDER_AGGREGATE';
    } else {
      totalTollAmount = null;
      tollEstimateSource = 'NONE';
    }

    const routePlan = await this.prisma.routePlan.create({
      data: {
        tenantId,
        tripId: trip.id,
        vehicleId: trip.composition?.vehicleId ?? null,
        originLabel: calculated.originLabel,
        destinationLabel: calculated.destinationLabel,
        originLatitude: calculated.originLatitude,
        originLongitude: calculated.originLongitude,
        destinationLatitude: calculated.destinationLatitude,
        destinationLongitude: calculated.destinationLongitude,
        distanceMeters: calculated.distanceMeters,
        durationSeconds: calculated.durationSeconds,
        encodedPolyline: calculated.encodedPolyline,
        totalTollAmount,
        tollEstimateSource,
        currency: calculated.estimatedTollCurrency ?? 'BRL',
        axleCountUsed,
        reason,
        provider: this.provider.providerName,
        providerRouteId: calculated.providerRouteId,
        tolls: { create: tollsData },
      },
      include: ROUTE_PLAN_INCLUDE,
    });

    return routePlan;
  }

  private async setCurrentRoutePlan(tenantId: string, tripId: string, routePlanId: string): Promise<void> {
    await this.prisma.trip.update({ where: { id: tripId }, data: { routePlanId } });
  }

  private async loadTollPlazaCandidates(): Promise<TollPlazaCandidate[]> {
    const plazas = await this.prisma.tollPlaza.findMany({
      where: { latitude: { not: null }, longitude: { not: null } },
      select: { id: true, name: true, latitude: true, longitude: true, pricePerAxle: true },
    });
    return plazas.map((plaza) => ({
      id: plaza.id,
      name: plaza.name,
      latitude: toNumberOrNull(plaza.latitude) ?? 0,
      longitude: toNumberOrNull(plaza.longitude) ?? 0,
      pricePerAxle: toNumberOrNull(plaza.pricePerAxle),
    }));
  }

  private async loadTripForRouting(tenantId: string, tripId: string): Promise<TripForRouting> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
      include: {
        origin: true,
        destination: true,
        composition: { include: { vehicle: true, axleConfiguration: true } },
      },
    });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }
    return trip;
  }

  private async assertTripExists(tenantId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId, deletedAt: null } });
    if (!trip) {
      throw new NotFoundException('Viagem nao encontrada nesta empresa.');
    }
    return trip;
  }

  // Fase 116 -- viagem ja ENCERRADA (COMPLETED) ou CANCELLED: a rota vira
  // historico e nao deve mais ser recalculada/trocada (preserva o que de
  // fato foi usado durante a execucao). So bloqueia as 4 ESCRITAS abaixo
  // (computar/alternativas/selecionar/recalcular) -- leitura
  // (getCurrent/getTolls/getDriverView) continua sempre permitida.
  private assertRouteWritable(trip: { status: TripStatus }): void {
    if (trip.status === TripStatus.COMPLETED || trip.status === TripStatus.CANCELLED) {
      throw new ConflictException(
        'Nao e possivel alterar a rota: a viagem ja esta COMPLETED/CANCELLED (rota preservada como historico).',
      );
    }
  }

  private originLabelOf(trip: TripForRouting): string {
    return trip.origin.address ?? trip.origin.name;
  }

  private destinationLabelOf(trip: TripForRouting): string {
    return trip.destination.address ?? trip.destination.name;
  }
}
