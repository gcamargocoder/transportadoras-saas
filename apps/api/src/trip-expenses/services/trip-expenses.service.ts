import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseStatus, Prisma, TripStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { assertAttachmentExists } from '../../common/utils/assert-attachment-exists.util';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTripExpenseDto } from '../dto/create-trip-expense.dto';
import { FindTripExpensesQueryDto } from '../dto/find-trip-expenses-query.dto';
import { UpdateTripExpenseStatusDto } from '../dto/update-trip-expense-status.dto';
import { UpdateTripExpenseDto } from '../dto/update-trip-expense.dto';
import { PaginatedTripExpensesEntity } from '../entities/paginated-trip-expenses.entity';
import { TripExpenseEntity } from '../entities/trip-expense.entity';
import { TripFinancialSummaryEntity } from '../entities/trip-financial-summary.entity';
import { toTripExpenseEntity, TripExpenseWithRelations } from '../mappers/trip-expense.mapper';

const EXPENSE_INCLUDE = {
  driver: true,
  vehicle: true,
  approver: true,
  creator: true,
  updater: true,
} satisfies Prisma.TripExpenseInclude;

// Somente despesas com decisao ainda PENDENTE podem mudar de status; a
// partir de uma decisao tomada (APPROVED/REJECTED) so resta CANCELLED
// (ex: reembolso estornado depois) -- mesmo estilo de mapa de transicoes
// ja usado em TripsService (Fase 14) para TripStatus.
const ALLOWED_STATUS_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  PENDING: [ExpenseStatus.APPROVED, ExpenseStatus.REJECTED, ExpenseStatus.CANCELLED],
  APPROVED: [ExpenseStatus.CANCELLED],
  REJECTED: [ExpenseStatus.CANCELLED],
  CANCELLED: [],
};

// Despesas que efetivamente representam custo real da viagem para fins de
// financial-summary -- REJECTED/CANCELLED sao excluidas (nunca aconteceram
// de fato / foram estornadas).
const COUNTED_STATUSES: ExpenseStatus[] = [ExpenseStatus.PENDING, ExpenseStatus.APPROVED];

@Injectable()
export class TripExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    tenantId: string,
    query: FindTripExpensesQueryDto,
  ): Promise<PaginatedTripExpensesEntity> {
    const where = this.buildWhere(tenantId, query);

    const [items, total] = await Promise.all([
      this.prisma.tripExpense.findMany({
        where,
        include: EXPENSE_INCLUDE,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tripExpense.count({ where }),
    ]);

    const result = new PaginatedTripExpensesEntity();
    result.items = items.map(toTripExpenseEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findAllForTrip(
    tenantId: string,
    tripId: string,
    query: FindTripExpensesQueryDto,
  ): Promise<PaginatedTripExpensesEntity> {
    await this.findTripOrThrow(tenantId, tripId);
    return this.findAll(tenantId, { ...query, tripId });
  }

  async findOne(tenantId: string, id: string): Promise<TripExpenseEntity> {
    return toTripExpenseEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateTripExpenseDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripExpenseEntity> {
    const trip = await this.findTripOrThrow(tenantId, dto.tripId);
    if (trip.status === TripStatus.CANCELLED) {
      throw new ConflictException('Nao e possivel registrar despesa em uma viagem cancelada.');
    }

    if (dto.attachmentId) {
      await assertAttachmentExists(this.prisma, tenantId, dto.attachmentId);
    }

    const expense = await this.prisma.tripExpense.create({
      data: {
        tenantId,
        tripId: dto.tripId,
        driverId: trip.driverId,
        vehicleId: trip.composition?.vehicleId ?? null,
        category: dto.category,
        description: dto.description,
        expenseDate: new Date(dto.expenseDate),
        amount: dto.amount,
        currency: dto.currency?.toUpperCase() ?? 'BRL',
        status: ExpenseStatus.PENDING,
        createdBy: actor.userId,
        ...compact({
          supplier: dto.supplier,
          documentNumber: dto.documentNumber,
          paymentMethod: dto.paymentMethod,
          attachmentId: dto.attachmentId,
        }),
      },
      include: EXPENSE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_expense.created',
      entityName: 'TripExpense',
      entityId: expense.id,
      newValue: toJsonSafe({
        tripId: expense.tripId,
        category: expense.category,
        amount: expense.amount,
        status: expense.status,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripExpenseEntity(expense);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTripExpenseDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripExpenseEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    if (before.status !== ExpenseStatus.PENDING) {
      throw new ConflictException(
        'Somente despesas com status PENDING podem ser editadas. Para aprovar, rejeitar ou ' +
          'cancelar, use PATCH /trip-expenses/:id/status.',
      );
    }

    if (dto.attachmentId) {
      await assertAttachmentExists(this.prisma, tenantId, dto.attachmentId);
    }

    const expense = await this.prisma.tripExpense.update({
      where: { id },
      data: {
        ...compact({
          category: dto.category,
          description: dto.description,
          supplier: dto.supplier,
          documentNumber: dto.documentNumber,
          expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
          amount: dto.amount,
          currency: dto.currency?.toUpperCase(),
          paymentMethod: dto.paymentMethod,
          attachmentId: dto.attachmentId,
        }),
        updatedBy: actor.userId,
      },
      include: EXPENSE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_expense.updated',
      entityName: 'TripExpense',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(expense),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripExpenseEntity(expense);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateTripExpenseStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TripExpenseEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const allowedTargets = ALLOWED_STATUS_TRANSITIONS[before.status];
    if (!allowedTargets.includes(dto.status)) {
      throw new ConflictException(
        `Transicao de status invalida: ${before.status} -> ${dto.status}.`,
      );
    }

    const isDecision =
      dto.status === ExpenseStatus.APPROVED || dto.status === ExpenseStatus.REJECTED;

    const expense = await this.prisma.tripExpense.update({
      where: { id },
      data: {
        status: dto.status,
        updatedBy: actor.userId,
        ...(isDecision ? { approvedBy: actor.userId, approvedAt: new Date() } : {}),
      },
      include: EXPENSE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: this.resolveStatusAction(dto.status),
      entityName: 'TripExpense',
      entityId: id,
      previousValue: { status: before.status },
      newValue: { status: expense.status },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTripExpenseEntity(expense);
  }

  async remove(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    await this.prisma.tripExpense.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_expense.deleted',
      entityName: 'TripExpense',
      entityId: id,
      previousValue: toJsonSafe({
        tripId: before.tripId,
        category: before.category,
        amount: before.amount,
        status: before.status,
      }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  // GET /trips/:id/financial-summary -- uma unica consulta agregada por
  // categoria (evita N+1), reduzida em memoria para os buckets pedidos.
  async getFinancialSummary(tenantId: string, tripId: string): Promise<TripFinancialSummaryEntity> {
    await this.findTripOrThrow(tenantId, tripId);

    const groups = await this.prisma.tripExpense.groupBy({
      by: ['category'],
      where: { tenantId, tripId, status: { in: COUNTED_STATUSES } },
      _sum: { amount: true },
      _count: { _all: true },
      _max: { amount: true },
    });

    const entity = new TripFinancialSummaryEntity();
    entity.tripId = tripId;
    entity.totalExpenses = 0;
    entity.fuelExpenses = 0;
    entity.foodExpenses = 0;
    entity.hotelExpenses = 0;
    entity.maintenanceExpenses = 0;
    entity.otherExpenses = 0;
    entity.tollExpenses = 0;
    entity.expenseCount = 0;
    entity.largestExpense = 0;

    for (const group of groups) {
      const sum = Number(group._sum.amount ?? 0);
      const max = Number(group._max.amount ?? 0);
      const count = group._count._all;

      entity.totalExpenses += sum;
      entity.expenseCount += count;
      entity.largestExpense = Math.max(entity.largestExpense, max);

      switch (group.category) {
        case 'FUEL':
          entity.fuelExpenses += sum;
          break;
        case 'FOOD':
          entity.foodExpenses += sum;
          break;
        case 'HOTEL':
          entity.hotelExpenses += sum;
          break;
        case 'MAINTENANCE':
          entity.maintenanceExpenses += sum;
          break;
        case 'TOLL_EXTRA':
          entity.tollExpenses += sum;
          break;
        default:
          entity.otherExpenses += sum;
      }
    }

    entity.averageExpense =
      entity.expenseCount > 0 ? entity.totalExpenses / entity.expenseCount : 0;
    return entity;
  }

  private buildWhere(
    tenantId: string,
    query: FindTripExpensesQueryDto,
  ): Prisma.TripExpenseWhereInput {
    return {
      tenantId,
      ...(query.tripId ? { tripId: query.tripId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.supplier
        ? { supplier: { contains: query.supplier, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.expenseDateFrom || query.expenseDateTo
        ? {
            expenseDate: {
              ...(query.expenseDateFrom ? { gte: new Date(query.expenseDateFrom) } : {}),
              ...(query.expenseDateTo ? { lte: new Date(query.expenseDateTo) } : {}),
            },
          }
        : {}),
      ...(query.minAmount !== undefined || query.maxAmount !== undefined
        ? {
            amount: {
              ...(query.minAmount !== undefined ? { gte: query.minAmount } : {}),
              ...(query.maxAmount !== undefined ? { lte: query.maxAmount } : {}),
            },
          }
        : {}),
    };
  }

  private resolveStatusAction(status: ExpenseStatus): string {
    switch (status) {
      case ExpenseStatus.APPROVED:
        return 'trip_expense.approved';
      case ExpenseStatus.REJECTED:
        return 'trip_expense.rejected';
      case ExpenseStatus.CANCELLED:
        return 'trip_expense.cancelled';
      default:
        return 'trip_expense.status_changed';
    }
  }

  private async findTripOrThrow(tenantId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId, deletedAt: null },
      include: { composition: true },
    });
    if (!trip) {
      throw new NotFoundException('Viagem (tripId) nao encontrada nesta empresa.');
    }
    return trip;
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<TripExpenseWithRelations> {
    const expense = await this.prisma.tripExpense.findFirst({
      where: { id, tenantId },
      include: EXPENSE_INCLUDE,
    });
    if (!expense) {
      throw new NotFoundException('Despesa de viagem nao encontrada nesta empresa.');
    }
    return expense;
  }
}
