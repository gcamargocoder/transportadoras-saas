import { Injectable, NotFoundException } from '@nestjs/common';
import { Customer, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { FindCustomersQueryDto } from '../dto/find-customers-query.dto';
import { CustomerEntity } from '../entities/customer.entity';
import { PaginatedCustomersEntity } from '../entities/paginated-customers.entity';
import { toCustomerEntity } from '../mappers/customer.mapper';

// Escopo deliberadamente minimo (create/list/get, sem update/delete): esta
// fase e sobre Trip, e Customer e apenas um pre-requisito estrutural (Trip.
// customerId). Gestao completa de clientes fica para uma fase dedicada.
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindCustomersQueryDto): Promise<PaginatedCustomersEntity> {
    const where: Prisma.CustomerWhereInput = {
      tenantId,
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
      data: { tenantId, name: dto.name, isActive: true, ...compact({ document: dto.document }) },
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

  async findActiveOrThrow(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!customer) {
      throw new NotFoundException('Cliente nao encontrado.');
    }
    return customer;
  }
}
