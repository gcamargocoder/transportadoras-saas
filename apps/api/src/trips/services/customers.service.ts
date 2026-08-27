import { Injectable, NotFoundException } from '@nestjs/common';
import { ContractStatus, Customer, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { FindCustomersQueryDto } from '../dto/find-customers-query.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { CustomerEntity } from '../entities/customer.entity';
import { CustomerSummaryEntity } from '../entities/customer-summary.entity';
import { PaginatedCustomersEntity } from '../entities/paginated-customers.entity';
import { toCustomerEntity } from '../mappers/customer.mapper';

// Fase 93 -- evoluido de um cadastro minimo (create/list/get) para a camada
// de CRM: edicao (PATCH) e um resumo de indicadores NAO financeiros
// (getSummary). Indicadores financeiros continuam nos dashboards ja
// existentes (Receivables/Billing), nunca duplicados aqui.
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindCustomersQueryDto): Promise<PaginatedCustomersEntity> {
    const where: Prisma.CustomerWhereInput = {
      tenantId,
      ...compact({ isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { document: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    const result = new PaginatedCustomersEntity();
    result.items = items.map(toCustomerEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<CustomerEntity> {
    return toCustomerEntity(await this.findActiveOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateCustomerDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<CustomerEntity> {
    const customer = await this.prisma.customer.create({
      data: {
        tenantId,
        name: dto.name,
        isActive: true,
        ...compact({ document: dto.document, phone: dto.phone, email: dto.email, address: dto.address }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'customer.created',
      entityName: 'Customer',
      entityId: customer.id,
      newValue: toJsonSafe({ name: customer.name, document: customer.document }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toCustomerEntity(customer);
  }

  // PATCH /customers/:id -- lacuna real ate a Fase 93 (cadastro so tinha
  // create/list/get).
  async update(
    tenantId: string,
    id: string,
    dto: UpdateCustomerDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<CustomerEntity> {
    const before = await this.findActiveOrThrow(tenantId, id);

    const customer = await this.prisma.customer.update({
      where: { id: before.id },
      data: compact({
        name: dto.name,
        document: dto.document,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        isActive: dto.isActive,
      }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'customer.updated',
      entityName: 'Customer',
      entityId: customer.id,
      newValue: toJsonSafe(dto),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toCustomerEntity(customer);
  }

  // GET /customers/:id/summary -- indicadores basicos e NAO financeiros
  // (ver nota da classe). Todas as consultas sao agregadas/batched em
  // paralelo (Promise.all), nunca uma por viagem/contrato -- evita N+1.
  async getSummary(tenantId: string, id: string): Promise<CustomerSummaryEntity> {
    await this.findActiveOrThrow(tenantId, id);

    const [tripsByStatus, tripDates, contactsCount, notesCount, contractsTotal, activeContractsCount] =
      await Promise.all([
        this.prisma.trip.groupBy({
          by: ['status'],
          where: { tenantId, customerId: id, deletedAt: null },
          _count: true,
        }),
        this.prisma.trip.aggregate({
          where: { tenantId, customerId: id, deletedAt: null },
          _min: { createdAt: true },
          _max: { createdAt: true },
        }),
        this.prisma.customerContact.count({ where: { tenantId, customerId: id } }),
        this.prisma.customerNote.count({ where: { tenantId, customerId: id } }),
        this.prisma.contract.count({ where: { tenantId, customerId: id } }),
        this.prisma.contract.count({ where: { tenantId, customerId: id, status: ContractStatus.ACTIVE } }),
      ]);

    const summary = new CustomerSummaryEntity();
    summary.customerId = id;
    summary.tripsByStatus = tripsByStatus.map((row) => ({ status: row.status, count: row._count }));
    summary.tripsTotal = tripsByStatus.reduce((sum, row) => sum + row._count, 0);
    summary.firstTripAt = tripDates._min.createdAt;
    summary.lastTripAt = tripDates._max.createdAt;
    summary.contactsCount = contactsCount;
    summary.notesCount = notesCount;
    summary.contractsTotal = contractsTotal;
    summary.activeContractsCount = activeContractsCount;
    return summary;
  }

  async findActiveOrThrow(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!customer) {
      throw new NotFoundException('Cliente nao encontrado.');
    }
    return customer;
  }
}
