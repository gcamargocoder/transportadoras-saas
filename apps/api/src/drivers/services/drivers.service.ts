import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Driver, Prisma, TripStatus } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDriverDto } from '../dto/create-driver.dto';
import { FindDriversQueryDto } from '../dto/find-drivers-query.dto';
import { LinkDriverUserDto } from '../dto/link-driver-user.dto';
import { UpdateDriverDto } from '../dto/update-driver.dto';
import { UpdateDriverStatusDto } from '../dto/update-driver-status.dto';
import { DriverEntity } from '../entities/driver.entity';
import { PaginatedDriversEntity } from '../entities/paginated-drivers.entity';
import { hasActiveRelationship } from '../interfaces/driver-relationship-counts.interface';
import { toDriverEntity } from '../mappers/driver.mapper';
import { cnhExpiringThreshold } from '../utils/cnh-expiry.util';
import { normalizeCpf } from '../utils/cpf.util';

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

    const result = new PaginatedDriversEntity();
    result.items = items.map(toDriverEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<DriverEntity> {
    const driver = await this.findActiveOrThrow(tenantId, id);
    return toDriverEntity(driver);
  }

  async create(
    tenantId: string,
    dto: CreateDriverDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverEntity> {
    const cpf = normalizeCpf(dto.cpf);
    await this.assertCpfAndCnhAvailable(tenantId, cpf, dto.cnhNumber);

    const driver = await this.prisma.driver.create({
      data: {
        tenantId,
        name: dto.name,
        cpf,
        cnhNumber: dto.cnhNumber,
        cnhCategory: dto.cnhCategory.toUpperCase(),
        cnhExpiresAt: new Date(dto.cnhExpiresAt),
        isActive: true,
        ...compact({
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

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'driver.created',
      entityName: 'Driver',
      entityId: driver.id,
      newValue: toJsonSafe({ name: driver.name, cpf: driver.cpf, cnhNumber: driver.cnhNumber }),
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
      }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'driver.updated',
      entityName: 'Driver',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(driver),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toDriverEntity(driver);
  }

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
      data: { isActive: dto.isActive },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'driver.status_changed',
      entityName: 'Driver',
      entityId: id,
      previousValue: { isActive: before.isActive },
      newValue: { isActive: driver.isActive },
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
        status: { in: [TripStatus.PLANNED, TripStatus.IN_PROGRESS] },
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
      data: { deletedAt: new Date(), isActive: false },
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

  async findActiveOrThrow(tenantId: string, id: string): Promise<Driver> {
    const driver = await this.prisma.driver.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!driver) {
      throw new NotFoundException('Motorista nao encontrado.');
    }
    return driver;
  }

  private async assertCpfAndCnhAvailable(
    tenantId: string,
    cpf: string | undefined,
    cnhNumber: string | undefined,
    before?: Driver,
  ): Promise<void> {
    if (cpf && cpf !== before?.cpf) {
      const existing = await this.prisma.driver.findUnique({
        where: { tenantId_cpf: { tenantId, cpf } },
      });
      if (existing) {
        throw new ConflictException('Ja existe um motorista com este CPF nesta empresa.');
      }
    }
    if (cnhNumber && cnhNumber !== before?.cnhNumber) {
      const existing = await this.prisma.driver.findUnique({
        where: { tenantId_cnhNumber: { tenantId, cnhNumber } },
      });
      if (existing) {
        throw new ConflictException('Ja existe um motorista com este numero de CNH nesta empresa.');
      }
    }
  }
}
