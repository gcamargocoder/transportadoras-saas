import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Driver, DriverStatus, DriverType, Prisma, TripStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PLAN_ERRORS } from '../../tenants/constants/plan-error.constants';
import { assertUnderLimit, runSerializable } from '../../tenants/utils/plan-limit.util';
import { AssignDriverVehicleDto } from '../dto/assign-driver-vehicle.dto';
import { CreateDriverDto } from '../dto/create-driver.dto';
import { FindDriversQueryDto } from '../dto/find-drivers-query.dto';
import { LinkDriverUserDto } from '../dto/link-driver-user.dto';
import { UpdateDriverDto } from '../dto/update-driver.dto';
import { UpdateDriverStatusDto } from '../dto/update-driver-status.dto';
import { DriverSummaryEntity } from '../entities/driver-summary.entity';
import { DriverVehicleAssignmentEntity } from '../entities/driver-vehicle-assignment.entity';
import { DriverEntity } from '../entities/driver.entity';
import { PaginatedDriversEntity } from '../entities/paginated-drivers.entity';
import { hasActiveRelationship } from '../interfaces/driver-relationship-counts.interface';
import { DriverCurrentVehicleContext, toDriverEntity } from '../mappers/driver.mapper';
import { resolveDriverStatusChangeAction } from '../utils/driver-status-transition.util';
import { cnhExpiringThreshold } from '../utils/cnh-expiry.util';
import { normalizeCpf } from '../utils/cpf.util';

const CURRENT_ASSIGNMENT_INCLUDE = {
  vehicle: { select: { id: true, plate: true } },
} satisfies Prisma.DriverVehicleAssignmentInclude;

// Isolamento multi-tenant: toda query recebe tenantId explicitamente e
// SEMPRE o inclui no where -- nunca busca Driver so por id (mesmo padrao
// ja usado em UsersService).
@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindDriversQueryDto): Promise<PaginatedDriversEntity> {
    const where: Prisma.DriverWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.cpf ? { cpf: normalizeCpf(query.cpf) } : {}),
      ...(query.cnhCategory ? { cnhCategory: query.cnhCategory.toUpperCase() } : {}),
      ...(query.cnhExpiringInDays !== undefined
        ? { cnhExpiresAt: { lte: cnhExpiringThreshold(query.cnhExpiringInDays) } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { cpf: { contains: normalizeCpf(query.search) || query.search } },
              { cnhNumber: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.driver.count({ where }),
    ]);

    // Veiculo atual resolvido em 1 unica query em lote (nunca 1 por linha).
    const currentVehicles = await this.getCurrentVehicleMap(
      tenantId,
      items.map((item) => item.id),
    );

    const result = new PaginatedDriversEntity();
    result.items = items.map((item) => toDriverEntity(item, currentVehicles.get(item.id)));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<DriverEntity> {
    const driver = await this.findActiveOrThrow(tenantId, id);
    const currentVehicles = await this.getCurrentVehicleMap(tenantId, [id]);
    return toDriverEntity(driver, currentVehicles.get(id));
  }

  /// GET /drivers/summary -- contagens por classificacao/status do tenant
  /// inteiro (2 groupBy em paralelo, independente da quantidade de
  /// motoristas -- secao 16 da Fase 61).
  async getSummary(tenantId: string): Promise<DriverSummaryEntity> {
    const [byType, byStatus] = await Promise.all([
      this.prisma.driver.groupBy({
        by: ['type'],
        where: { tenantId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.driver.groupBy({
        by: ['status'],
        where: { tenantId, deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    const findCount = (rows: { _count: { _all: number } }[], predicate: (row: unknown) => boolean): number =>
      rows.filter(predicate).reduce((sum, row) => sum + row._count._all, 0);

    const entity = new DriverSummaryEntity();
    entity.totalOwn = findCount(byType, (row) => (row as { type: DriverType }).type === DriverType.OWN);
    entity.totalAggregated = findCount(byType, (row) => (row as { type: DriverType }).type === DriverType.AGGREGATED);
    entity.totalThirdParty = findCount(byType, (row) => (row as { type: DriverType }).type === DriverType.THIRD_PARTY);
    entity.totalActive = findCount(byStatus, (row) => (row as { status: DriverStatus }).status === DriverStatus.ACTIVE);
    entity.totalInactive = findCount(byStatus, (row) => (row as { status: DriverStatus }).status === DriverStatus.INACTIVE);
    entity.totalSuspended = findCount(byStatus, (row) => (row as { status: DriverStatus }).status === DriverStatus.SUSPENDED);
    return entity;
  }

  async create(
    tenantId: string,
    dto: CreateDriverDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverEntity> {
    const cpf = normalizeCpf(dto.cpf);

    // Fase 48 -- checagem de duplicidade + limite do plano + create numa
    // unica transacao Serializable: garante que duas criacoes concorrentes
    // nunca ultrapassem juntas o limite de motoristas do tenant. O limite
    // conta TODOS os motoristas (deletedAt null), independente da
    // classificacao OWN/AGGREGATED/THIRD_PARTY -- nunca burlavel por tipo
    // (Fase 61, secao 10).
    const driver = await runSerializable(this.prisma, async (tx) => {
      await this.assertCpfAndCnhAvailable(tenantId, cpf, dto.cnhNumber, undefined, tx);

      const plan = await tx.tenantPlan.findUnique({ where: { tenantId } });
      const count = await tx.driver.count({ where: { tenantId, deletedAt: null } });
      assertUnderLimit(count, plan?.maxDrivers, PLAN_ERRORS.DRIVER_LIMIT_REACHED);

      return tx.driver.create({
        data: {
          tenantId,
          name: dto.name,
          cpf,
          cnhNumber: dto.cnhNumber,
          cnhCategory: dto.cnhCategory.toUpperCase(),
          cnhExpiresAt: new Date(dto.cnhExpiresAt),
          isActive: true,
          status: DriverStatus.ACTIVE,
          ...compact({
            type: dto.type,
            isAvailable: dto.isAvailable,
            rg: dto.rg,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
            phone: dto.phone,
            email: dto.email,
            address: dto.address,
            city: dto.city,
            state: dto.state?.toUpperCase(),
            zipCode: dto.zipCode,
            notes: dto.notes,
            admissionDate: dto.admissionDate ? new Date(dto.admissionDate) : undefined,
          }),
        },
      });
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'driver.created',
      entityName: 'Driver',
      entityId: driver.id,
      newValue: toJsonSafe({ name: driver.name, cpf: driver.cpf, cnhNumber: driver.cnhNumber, type: driver.type }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toDriverEntity(driver);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateDriverDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const cpf = dto.cpf ? normalizeCpf(dto.cpf) : undefined;
    await this.assertCpfAndCnhAvailable(tenantId, cpf, dto.cnhNumber, before);

    const driver = await this.prisma.driver.update({
      where: { id },
      data: compact({
        name: dto.name,
        cpf,
        rg: dto.rg,
        cnhNumber: dto.cnhNumber,
        cnhCategory: dto.cnhCategory?.toUpperCase(),
        cnhExpiresAt: dto.cnhExpiresAt ? new Date(dto.cnhExpiresAt) : undefined,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        city: dto.city,
        state: dto.state?.toUpperCase(),
        zipCode: dto.zipCode,
        notes: dto.notes,
        admissionDate: dto.admissionDate ? new Date(dto.admissionDate) : undefined,
        terminationDate: dto.terminationDate ? new Date(dto.terminationDate) : undefined,
        type: dto.type,
        isAvailable: dto.isAvailable,
      }),
    });

    // Alteracao de classificacao ganha sua propria acao de auditoria
    // distinta (secao 13 da Fase 61), sem duplicar o log generico abaixo.
    const classificationChanged = dto.type !== undefined && dto.type !== before.type;

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: classificationChanged ? 'driver.classification_changed' : 'driver.updated',
      entityName: 'Driver',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(driver),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toDriverEntity(driver);
  }

  /// PATCH /drivers/:id/status -- unica forma valida de mudar o status
  /// operacional. isActive e SEMPRE recalculado a partir de status aqui
  /// (status == ACTIVE), preservando o comportamento de TODAS as
  /// checagens ja existentes que leem isActive (TripsService, DriverGuard)
  /// sem precisar altera-las.
  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateDriverStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const driver = await this.prisma.driver.update({
      where: { id },
      data: { status: dto.status, isActive: dto.status === DriverStatus.ACTIVE },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: resolveDriverStatusChangeAction(before.status, driver.status),
      entityName: 'Driver',
      entityId: id,
      previousValue: { status: before.status, isActive: before.isActive },
      newValue: { status: driver.status, isActive: driver.isActive },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toDriverEntity(driver);
  }

  async softDelete(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const activeTrips = await this.prisma.trip.count({
      where: {
        tenantId,
        driverId: id,
        deletedAt: null,
        // "ativa" = ainda nao concluida/cancelada (cobre toda a maquina de
        // estados da Fase 14: PLANNED, WAITING_DRIVER, WAITING_DEPARTURE,
        // IN_PROGRESS, PAUSED).
        status: { notIn: [TripStatus.COMPLETED, TripStatus.CANCELLED] },
      },
    });
    if (hasActiveRelationship({ activeTrips })) {
      throw new ConflictException(
        `Nao e possivel excluir este motorista: existem viagens ativas vinculadas (${activeTrips}). ` +
          'Finalize ou cancele essas viagens antes de excluir o motorista.',
      );
    }

    await this.prisma.driver.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, status: DriverStatus.INACTIVE },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'driver.deleted',
      entityName: 'Driver',
      entityId: id,
      previousValue: toJsonSafe({ name: before.name, cpf: before.cpf, isActive: before.isActive }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  // Login opcional: vincula um UserAccount JA EXISTENTE (mesmo tenant) ao
  // motorista -- nunca cria usuario aqui. userAccountId e @unique em Driver,
  // entao um UserAccount so pode estar vinculado a um motorista por vez.
  async linkUser(
    tenantId: string,
    id: string,
    dto: LinkDriverUserDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const userAccount = await this.prisma.userAccount.findFirst({
      where: { id: dto.userAccountId, tenantId, deletedAt: null },
    });
    if (!userAccount) {
      throw new NotFoundException('Usuario nao encontrado nesta empresa.');
    }

    const alreadyLinkedTo = await this.prisma.driver.findUnique({
      where: { userAccountId: dto.userAccountId },
    });
    if (alreadyLinkedTo && alreadyLinkedTo.id !== id) {
      throw new ConflictException('Este usuario ja esta vinculado a outro motorista.');
    }

    const driver = await this.prisma.driver.update({
      where: { id },
      data: { userAccountId: dto.userAccountId },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'driver.user_linked',
      entityName: 'Driver',
      entityId: id,
      previousValue: { userAccountId: before.userAccountId },
      newValue: { userAccountId: driver.userAccountId },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toDriverEntity(driver);
  }

  async unlinkUser(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);
    if (!before.userAccountId) {
      throw new ConflictException('Este motorista nao possui usuario vinculado.');
    }

    const driver = await this.prisma.driver.update({
      where: { id },
      data: { userAccountId: null },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'driver.user_unlinked',
      entityName: 'Driver',
      entityId: id,
      previousValue: { userAccountId: before.userAccountId },
      newValue: { userAccountId: null },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toDriverEntity(driver);
  }

  /// GET /drivers/:id/vehicle-assignments -- historico completo (atual +
  /// anteriores), mais recente primeiro. 1 unica query.
  async getVehicleAssignments(tenantId: string, driverId: string): Promise<DriverVehicleAssignmentEntity[]> {
    await this.findActiveOrThrow(tenantId, driverId);

    const assignments = await this.prisma.driverVehicleAssignment.findMany({
      where: { tenantId, driverId },
      include: { ...CURRENT_ASSIGNMENT_INCLUDE, creator: true },
      orderBy: { startedAt: 'desc' },
    });

    return assignments.map((assignment) => {
      const entity = new DriverVehicleAssignmentEntity();
      entity.id = assignment.id;
      entity.driverId = assignment.driverId;
      entity.vehicleId = assignment.vehicleId;
      entity.vehiclePlate = assignment.vehicle.plate;
      entity.startedAt = assignment.startedAt;
      entity.endedAt = assignment.endedAt;
      entity.notes = assignment.notes;
      entity.createdBy = assignment.createdBy;
      entity.creatorName = assignment.creator.name;
      entity.createdAt = assignment.createdAt;
      return entity;
    });
  }

  /// POST /drivers/:id/vehicle-assignments -- vincula um veiculo ao
  /// motorista. Fecha o vinculo atual (endedAt = agora) se existir e abre
  /// um novo, numa unica transacao -- nunca apaga/sobrescreve a linha
  /// anterior (secao 4 da Fase 61: "troca de veiculo sem apagar
  /// historico"). Nunca altera TripComposition/Trip ja registradas.
  async assignVehicle(
    tenantId: string,
    driverId: string,
    dto: AssignDriverVehicleDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverVehicleAssignmentEntity[]> {
    await this.findActiveOrThrow(tenantId, driverId);

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, tenantId, deletedAt: null },
    });
    if (!vehicle) {
      throw new NotFoundException('Veiculo (vehicleId) nao encontrado nesta empresa.');
    }

    const current = await this.prisma.driverVehicleAssignment.findFirst({
      where: { tenantId, driverId, endedAt: null },
    });
    // Fase 62 -- encontrado durante a integracao Vehicle -> "motorista
    // atual": sem isto, o MESMO veiculo poderia ter 2 motoristas com
    // assignment aberto simultaneamente (o vinculo so era fechado pelo lado
    // do motorista antigo, nunca pelo lado do veiculo antigo), tornando
    // "motorista atual do veiculo" ambiguo. Fecha o vinculo aberto de
    // QUALQUER OUTRO motorista com este mesmo veiculo, preservando o
    // historico (nunca apagado, so endedAt).
    const currentOnVehicle = await this.prisma.driverVehicleAssignment.findFirst({
      where: { tenantId, vehicleId: dto.vehicleId, endedAt: null, driverId: { not: driverId } },
    });
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.driverVehicleAssignment.update({ where: { id: current.id }, data: { endedAt: now } });
      }
      if (currentOnVehicle) {
        await tx.driverVehicleAssignment.update({ where: { id: currentOnVehicle.id }, data: { endedAt: now } });
      }
      await tx.driverVehicleAssignment.create({
        data: {
          tenantId,
          driverId,
          vehicleId: dto.vehicleId,
          startedAt: now,
          createdBy: actor.userId,
          ...compact({ notes: dto.notes }),
        },
      });
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'driver.vehicle_assignment_changed',
      entityName: 'Driver',
      entityId: driverId,
      previousValue: current ? toJsonSafe({ vehicleId: current.vehicleId }) : null,
      newValue: toJsonSafe({ vehicleId: dto.vehicleId }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.getVehicleAssignments(tenantId, driverId);
  }

  /// POST /drivers/:id/vehicle-assignments/end -- encerra o vinculo atual
  /// sem abrir um novo (motorista fica sem veiculo atribuido). Historico
  /// preservado.
  async endVehicleAssignment(
    tenantId: string,
    driverId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverVehicleAssignmentEntity[]> {
    await this.findActiveOrThrow(tenantId, driverId);

    const current = await this.prisma.driverVehicleAssignment.findFirst({
      where: { tenantId, driverId, endedAt: null },
    });
    if (!current) {
      throw new ConflictException('Este motorista nao possui veiculo vinculado atualmente.');
    }

    await this.prisma.driverVehicleAssignment.update({ where: { id: current.id }, data: { endedAt: new Date() } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'driver.vehicle_assignment_changed',
      entityName: 'Driver',
      entityId: driverId,
      previousValue: toJsonSafe({ vehicleId: current.vehicleId }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.getVehicleAssignments(tenantId, driverId);
  }

  async findActiveOrThrow(tenantId: string, id: string): Promise<Driver> {
    const driver = await this.prisma.driver.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!driver) {
      throw new NotFoundException('Motorista nao encontrado.');
    }
    return driver;
  }

  /// Resolve o veiculo ATUAL (assignment sem endedAt) de varios motoristas
  /// em 1 unica query -- nunca 1 por linha (secao 16 da Fase 61).
  private async getCurrentVehicleMap(
    tenantId: string,
    driverIds: string[],
  ): Promise<Map<string, DriverCurrentVehicleContext>> {
    if (driverIds.length === 0) return new Map();

    const current = await this.prisma.driverVehicleAssignment.findMany({
      where: { tenantId, driverId: { in: driverIds }, endedAt: null },
      include: CURRENT_ASSIGNMENT_INCLUDE,
    });

    return new Map(
      current.map((assignment) => [
        assignment.driverId,
        { currentVehicleId: assignment.vehicleId, currentVehiclePlate: assignment.vehicle.plate },
      ]),
    );
  }

  // Fase 48 -- aceita opcionalmente o client de uma transacao (`tx`) para
  // create() poder rodar esta checagem dentro da mesma transacao
  // Serializable do limite do plano; update() continua chamando sem client
  // (default this.prisma), comportamento identico ao anterior.
  private async assertCpfAndCnhAvailable(
    tenantId: string,
    cpf: string | undefined,
    cnhNumber: string | undefined,
    before?: Driver,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    if (cpf && cpf !== before?.cpf) {
      const existing = await client.driver.findUnique({
        where: { tenantId_cpf: { tenantId, cpf } },
      });
      if (existing) {
        throw new ConflictException('Ja existe um motorista com este CPF nesta empresa.');
      }
    }
    if (cnhNumber && cnhNumber !== before?.cnhNumber) {
      const existing = await client.driver.findUnique({
        where: { tenantId_cnhNumber: { tenantId, cnhNumber } },
      });
      if (existing) {
        throw new ConflictException('Ja existe um motorista com este numero de CNH nesta empresa.');
      }
    }
  }
}
