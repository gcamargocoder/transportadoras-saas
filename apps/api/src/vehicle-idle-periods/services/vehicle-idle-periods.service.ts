import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, VehicleIdlePeriodSource, VehicleIdleReason } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
// Fase B -- REUTILIZA o utilitario de duracao ja existente (Fase 25/43),
// nunca um segundo mecanismo de calculo.
import { computeDurationMinutesOrThrow } from '../../trip-operations/utils/trip-stop-duration.util';
import { computeIdlePeriodDurationMinutes } from '../utils/idle-period-duration.util';
import { CreateVehicleIdlePeriodDto } from '../dto/create-vehicle-idle-period.dto';
import { FindVehicleIdlePeriodsQueryDto } from '../dto/find-vehicle-idle-periods-query.dto';
import { UpdateVehicleIdlePeriodDto } from '../dto/update-vehicle-idle-period.dto';
import { PaginatedVehicleIdlePeriodsEntity, VehicleIdlePeriodEntity } from '../entities/vehicle-idle-period.entity';
import { IDLE_PERIOD_INCLUDE, toVehicleIdlePeriodEntity } from '../mappers/vehicle-idle-period.mapper';
import { resolveDefaultIdleReason } from '../utils/default-idle-reason.util';

// Cliente de transacao do Prisma -- os helpers AUTO recebem o `tx` da
// transacao de mudanca de status da viagem (TripsService.updateStatus),
// para abrir/fechar o periodo ATOMICAMENTE junto com a transicao.
type TxClient = Prisma.TransactionClient;

@Injectable()
export class VehicleIdlePeriodsService {
  private readonly logger = new Logger(VehicleIdlePeriodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ==========================================================================
  // Fase B -- ABERTURA/FECHAMENTO AUTOMATICO (source=AUTO), chamados DENTRO
  // da transacao de TripsService.updateStatus. Idempotencia e concorrencia
  // garantidas no BANCO: indice unico PARCIAL
  // (vehicle_idle_periods_one_open_per_vehicle, WHERE ended_at IS NULL) +
  // createMany({skipDuplicates}) (ON CONFLICT DO NOTHING -- NUNCA lanca,
  // seguro dentro da transacao da viagem) na abertura; updateMany com
  // `endedAt: null` no WHERE (guarda contra fechamento concorrente) no
  // fechamento.
  // ==========================================================================

  // Chamado quando uma viagem passa para COMPLETED. `startedAt` = actualArrival
  // da viagem concluida (nunca inventado). Se o veiculo JA tem um periodo
  // aberto (outra viagem, reprocessamento, corrida entre 2 conclusoes), o
  // ON CONFLICT DO NOTHING simplesmente nao insere -- nunca duplica, nunca
  // erra.
  async openForCompletedTrip(
    tx: TxClient,
    params: { tenantId: string; vehicleId: string; startedAt: Date; tripBeforeId: string },
  ): Promise<{ created: boolean }> {
    const settings = await tx.tenantSettings.findUnique({
      where: { tenantId: params.tenantId },
      select: { preferences: true },
    });
    const reason = resolveDefaultIdleReason(settings?.preferences);

    const result = await tx.vehicleIdlePeriod.createMany({
      data: [
        {
          tenantId: params.tenantId,
          vehicleId: params.vehicleId,
          startedAt: params.startedAt,
          reason,
          source: VehicleIdlePeriodSource.AUTO,
          tripBeforeId: params.tripBeforeId,
        },
      ],
      skipDuplicates: true,
    });
    return { created: result.count > 0 };
  }

  // Chamado quando uma viagem REALMENTE inicia (primeira transicao para
  // IN_PROGRESS, quando actualDeparture passa a existir). Se NAO houver
  // periodo aberto para o veiculo, nao cria nada retroativo -- apenas
  // retorna { closed: false }.
  async closeForStartedTrip(
    tx: TxClient,
    params: { tenantId: string; vehicleId: string; endedAt: Date; tripAfterId: string },
  ): Promise<{ closed: boolean; periodId: string | null }> {
    const open = await tx.vehicleIdlePeriod.findFirst({
      where: { tenantId: params.tenantId, vehicleId: params.vehicleId, endedAt: null },
      select: { id: true, startedAt: true },
    });
    if (!open) return { closed: false, periodId: null };

    const durationMinutes = computeIdlePeriodDurationMinutes(open.startedAt, params.endedAt);
    const safeEnd = params.endedAt.getTime() < open.startedAt.getTime() ? open.startedAt : params.endedAt;

    const res = await tx.vehicleIdlePeriod.updateMany({
      where: { id: open.id, endedAt: null },
      data: { endedAt: safeEnd, durationMinutes, tripAfterId: params.tripAfterId },
    });
    return { closed: res.count > 0, periodId: res.count > 0 ? open.id : null };
  }

  // Auditoria pos-commit (fora da transacao da viagem, best-effort -- uma
  // falha aqui nunca desfaz a transicao ja confirmada). entityId = id do
  // proprio periodo.
  async logAutoOpen(tenantId: string, vehicleId: string, tripBeforeId: string, actor: AuditActor, metadata: RequestMetadata): Promise<void> {
    const period = await this.prisma.vehicleIdlePeriod.findFirst({
      where: { tenantId, vehicleId, endedAt: null, tripBeforeId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, startedAt: true, reason: true },
    });
    if (!period) return;
    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle_idle_period.opened',
      entityName: 'VehicleIdlePeriod',
      entityId: period.id,
      newValue: toJsonSafe({ vehicleId, tripBeforeId, startedAt: period.startedAt, reason: period.reason, source: 'AUTO' }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async logAutoClose(tenantId: string, periodId: string, tripAfterId: string, actor: AuditActor, metadata: RequestMetadata): Promise<void> {
    const period = await this.prisma.vehicleIdlePeriod.findFirst({
      where: { tenantId, id: periodId },
      select: { endedAt: true, durationMinutes: true },
    });
    if (!period) return;
    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle_idle_period.closed',
      entityName: 'VehicleIdlePeriod',
      entityId: periodId,
      newValue: toJsonSafe({ tripAfterId, endedAt: period.endedAt, durationMinutes: period.durationMinutes, source: 'AUTO' }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  // ==========================================================================
  // CRUD administrativo (secao 6). RBAC/tenant isolation aplicados no
  // controller/aqui (todo `where` tem tenantId).
  // ==========================================================================

  async create(
    tenantId: string,
    dto: CreateVehicleIdlePeriodDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleIdlePeriodEntity> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Veiculo nao encontrado nesta empresa.');
    }
    await this.assertTripBelongsIfProvided(tenantId, dto.tripBeforeId);
    await this.assertTripBelongsIfProvided(tenantId, dto.tripAfterId);

    const startedAt = new Date(dto.startedAt);
    let endedAt: Date | null = null;
    let durationMinutes: number | null = null;
    if (dto.endedAt) {
      endedAt = new Date(dto.endedAt);
      if (endedAt.getTime() < startedAt.getTime()) {
        throw new BadRequestException('endedAt nao pode ser anterior a startedAt.');
      }
      durationMinutes = computeDurationMinutesOrThrow(startedAt, endedAt);
    }

    const reason = dto.reason ?? (await this.resolveDefaultReason(tenantId));

    // Periodo ABERTO: um veiculo nunca pode ter 2 abertos. Checagem
    // amigavel + o indice parcial no banco como barreira final (P2002).
    if (endedAt === null) {
      const alreadyOpen = await this.prisma.vehicleIdlePeriod.findFirst({
        where: { tenantId, vehicleId: dto.vehicleId, endedAt: null },
        select: { id: true },
      });
      if (alreadyOpen) {
        throw new ConflictException('Este veiculo ja possui um periodo ocioso ABERTO. Feche o periodo atual antes de abrir outro.');
      }
    }

    const created = await this.createRowOrConflict({
      tenantId,
      vehicleId: dto.vehicleId,
      startedAt,
      endedAt,
      durationMinutes,
      reason,
      source: VehicleIdlePeriodSource.MANUAL_ADMIN,
      ...compact({ tripBeforeId: dto.tripBeforeId, tripAfterId: dto.tripAfterId, notes: dto.notes }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle_idle_period.created',
      entityName: 'VehicleIdlePeriod',
      entityId: created.id,
      newValue: toJsonSafe({ vehicleId: created.vehicleId, startedAt: created.startedAt, reason: created.reason, source: created.source }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toVehicleIdlePeriodEntity(created);
  }

  async findAll(tenantId: string, query: FindVehicleIdlePeriodsQueryDto): Promise<PaginatedVehicleIdlePeriodsEntity> {
    const where = this.buildWhere(tenantId, query);
    const [items, total] = await Promise.all([
      this.prisma.vehicleIdlePeriod.findMany({
        where,
        include: IDLE_PERIOD_INCLUDE,
        // Postgres: `DESC` ordena NULLS FIRST por padrao -> periodos ABERTOS
        // (endedAt=null) primeiro, depois os fechados do mais recente ao
        // mais antigo; desempate por startedAt desc. Deterministico e sem
        // depender da opcao `nulls` do orderBy.
        orderBy: [{ endedAt: 'desc' }, { startedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.vehicleIdlePeriod.count({ where }),
    ]);

    const result = new PaginatedVehicleIdlePeriodsEntity();
    result.items = items.map(toVehicleIdlePeriodEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<VehicleIdlePeriodEntity> {
    return toVehicleIdlePeriodEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateVehicleIdlePeriodDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleIdlePeriodEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const data: Prisma.VehicleIdlePeriodUpdateInput = {};
    if (dto.reason !== undefined) data.reason = dto.reason;
    if (dto.notes !== undefined) data.notes = dto.notes;

    if (dto.endedAt !== undefined) {
      const endedAt = new Date(dto.endedAt);
      if (endedAt.getTime() < before.startedAt.getTime()) {
        throw new BadRequestException('endedAt nao pode ser anterior a startedAt.');
      }
      data.endedAt = endedAt;
      // Duracao SEMPRE recalculada pelo backend, nunca aceita do cliente.
      data.durationMinutes = computeDurationMinutesOrThrow(before.startedAt, endedAt);
    }

    const updated = await this.prisma.vehicleIdlePeriod.update({
      where: { id },
      data,
      include: IDLE_PERIOD_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle_idle_period.updated',
      entityName: 'VehicleIdlePeriod',
      entityId: id,
      previousValue: toJsonSafe({ reason: before.reason, endedAt: before.endedAt, durationMinutes: before.durationMinutes, notes: before.notes }),
      newValue: toJsonSafe({ reason: updated.reason, endedAt: updated.endedAt, durationMinutes: updated.durationMinutes, notes: updated.notes }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toVehicleIdlePeriodEntity(updated);
  }

  // ==========================================================================
  // Fase C -- acao do Driver App: informar/corrigir o MOTIVO do periodo
  // ocioso ABERTO do veiculo que o proprio motorista acabou de operar.
  // OPERA SOBRE O PERIODO JA CRIADO pela Fase B -- nunca cria um 2o periodo.
  // Nunca aceita duracao/data do celular. Idempotente por ESTADO (definir o
  // mesmo motivo 2x tem o mesmo efeito). Guardado por `endedAt: null` no
  // WHERE -- se a proxima viagem ja fechou o periodo (corrida), a acao vira
  // no-op (retorna null), nunca reabre nada.
  // ==========================================================================

  // O periodo ABERTO cujo tripBefore.driverId e este motorista -- ou seja, o
  // veiculo da ultima viagem que ELE concluiu. Nunca expoe periodo de outro
  // motorista/veiculo/tenant.
  async findCurrentForDriver(tenantId: string, driverId: string): Promise<VehicleIdlePeriodEntity | null> {
    const row = await this.prisma.vehicleIdlePeriod.findFirst({
      where: { tenantId, endedAt: null, tripBefore: { is: { driverId } } },
      include: IDLE_PERIOD_INCLUDE,
      orderBy: { startedAt: 'desc' },
    });
    return row ? toVehicleIdlePeriodEntity(row) : null;
  }

  async setReasonByDriver(
    tenantId: string,
    driverId: string,
    reason: VehicleIdleReason,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleIdlePeriodEntity | null> {
    const open = await this.prisma.vehicleIdlePeriod.findFirst({
      where: { tenantId, endedAt: null, tripBefore: { is: { driverId } } },
      select: { id: true, reason: true, source: true },
      orderBy: { startedAt: 'desc' },
    });
    if (!open) return null;

    // updateMany + `endedAt: null` no WHERE: se um inicio de viagem
    // concorrente ja fechou o periodo entre o findFirst e aqui, 0 linhas
    // sao afetadas e a acao vira no-op (nunca reabre / nunca sobrescreve um
    // periodo fechado).
    const res = await this.prisma.vehicleIdlePeriod.updateMany({
      where: { id: open.id, tenantId, endedAt: null },
      data: { reason, source: VehicleIdlePeriodSource.DRIVER_APP },
    });
    if (res.count === 0) return null;

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle_idle_period.reason_set_by_driver',
      entityName: 'VehicleIdlePeriod',
      entityId: open.id,
      previousValue: toJsonSafe({ reason: open.reason, source: open.source }),
      newValue: toJsonSafe({ reason, source: 'DRIVER_APP' }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    const row = await this.prisma.vehicleIdlePeriod.findFirst({
      where: { id: open.id, tenantId },
      include: IDLE_PERIOD_INCLUDE,
    });
    return row ? toVehicleIdlePeriodEntity(row) : null;
  }

  // ==========================================================================

  private buildWhere(tenantId: string, query: FindVehicleIdlePeriodsQueryDto): Prisma.VehicleIdlePeriodWhereInput {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : null;

    const where: Prisma.VehicleIdlePeriodWhereInput = {
      tenantId,
      ...compact({ vehicleId: query.vehicleId, reason: query.reason }),
    };
    if (query.open === true) where.endedAt = null;

    // Janela from/to: mantem o periodo que SOBREPOE [from, to].
    if (to) where.startedAt = { lte: to };
    if (from) where.OR = [{ endedAt: null }, { endedAt: { gte: from } }];

    return where;
  }

  private async createRowOrConflict(data: Prisma.VehicleIdlePeriodUncheckedCreateInput) {
    try {
      return await this.prisma.vehicleIdlePeriod.create({ data, include: IDLE_PERIOD_INCLUDE });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este veiculo ja possui um periodo ocioso ABERTO.');
      }
      throw error;
    }
  }

  private async resolveDefaultReason(tenantId: string): Promise<VehicleIdleReason> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { preferences: true },
    });
    return resolveDefaultIdleReason(settings?.preferences);
  }

  private async assertTripBelongsIfProvided(tenantId: string, tripId: string | undefined): Promise<void> {
    if (!tripId) return;
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId, deletedAt: null }, select: { id: true } });
    if (!trip) {
      throw new NotFoundException('Viagem (tripBeforeId/tripAfterId) nao encontrada nesta empresa.');
    }
  }

  private async findOwnedOrThrow(tenantId: string, id: string) {
    const row = await this.prisma.vehicleIdlePeriod.findFirst({
      where: { id, tenantId },
      include: IDLE_PERIOD_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Periodo ocioso nao encontrado nesta empresa.');
    }
    return row;
  }
}
