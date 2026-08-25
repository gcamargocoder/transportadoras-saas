import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MaintenanceProvider, MaintenanceProviderType, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMaintenanceProviderDto } from '../dto/create-maintenance-provider.dto';
import { FindMaintenanceProvidersQueryDto } from '../dto/find-maintenance-providers-query.dto';
import { UpdateMaintenanceProviderStatusDto } from '../dto/update-maintenance-provider-status.dto';
import { UpdateMaintenanceProviderDto } from '../dto/update-maintenance-provider.dto';
import { MaintenanceProviderSummaryEntity } from '../entities/maintenance-provider-summary.entity';
import { MaintenanceProviderEntity } from '../entities/maintenance-provider.entity';
import { PaginatedMaintenanceProvidersEntity } from '../entities/paginated-maintenance-providers.entity';
import { toMaintenanceProviderEntity } from '../mappers/maintenance-provider.mapper';

const TYPE_LABEL: Record<MaintenanceProviderType, string> = {
  WORKSHOP: 'oficina',
  SUPPLIER: 'fornecedor',
};

// Fase 84 -- oficina e fornecedor sao a MESMA entidade (MaintenanceProvider),
// discriminada por `type` (ver comentario do model no schema.prisma). Nenhum
// service/tabela paralela para "Workshop" -- este service atende os dois
// conceitos.
@Injectable()
export class MaintenanceProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    tenantId: string,
    query: FindMaintenanceProvidersQueryDto,
  ): Promise<PaginatedMaintenanceProvidersEntity> {
    const where: Prisma.MaintenanceProviderWhereInput = {
      tenantId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { tradeName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { document: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.maintenanceProvider.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.maintenanceProvider.count({ where }),
    ]);

    const result = new PaginatedMaintenanceProvidersEntity();
    result.items = items.map(toMaintenanceProviderEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<MaintenanceProviderEntity> {
    return toMaintenanceProviderEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    dto: CreateMaintenanceProviderDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceProviderEntity> {
    if (dto.document) {
      await this.assertDocumentAvailable(tenantId, dto.type, dto.document);
    }

    const provider = await this.prisma.maintenanceProvider.create({
      data: {
        tenantId,
        type: dto.type,
        name: dto.name,
        createdBy: actor.userId,
        ...compact({
          tradeName: dto.tradeName,
          document: dto.document,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          contactName: dto.contactName,
          specialties: dto.specialties,
          notes: dto.notes,
        }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'maintenance_provider.created',
      entityName: 'MaintenanceProvider',
      entityId: provider.id,
      newValue: toJsonSafe({ type: provider.type, name: provider.name, document: provider.document }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toMaintenanceProviderEntity(provider);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateMaintenanceProviderDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceProviderEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    if (dto.document && dto.document !== before.document) {
      await this.assertDocumentAvailable(tenantId, before.type, dto.document);
    }

    const provider = await this.prisma.maintenanceProvider.update({
      where: { id },
      data: compact({
        name: dto.name,
        tradeName: dto.tradeName,
        document: dto.document,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        contactName: dto.contactName,
        specialties: dto.specialties,
        notes: dto.notes,
      }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'maintenance_provider.updated',
      entityName: 'MaintenanceProvider',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(provider),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toMaintenanceProviderEntity(provider);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateMaintenanceProviderStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<MaintenanceProviderEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const provider = await this.prisma.maintenanceProvider.update({
      where: { id },
      data: { isActive: dto.isActive },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: dto.isActive ? 'maintenance_provider.activated' : 'maintenance_provider.deactivated',
      entityName: 'MaintenanceProvider',
      entityId: id,
      previousValue: { isActive: before.isActive },
      newValue: { isActive: provider.isActive },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toMaintenanceProviderEntity(provider);
  }

  async remove(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    const usageCount = await this.prisma.vehicleMaintenance.count({
      where: { tenantId, OR: [{ workshopId: id }, { supplierId: id }] },
    });
    if (usageCount > 0) {
      throw new ConflictException(
        `Nao e possivel excluir esta ${TYPE_LABEL[before.type]}: existem ${usageCount} OS vinculada(s). ` +
          'Desative o cadastro em vez de excluir.',
      );
    }

    await this.prisma.maintenanceProvider.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'maintenance_provider.deleted',
      entityName: 'MaintenanceProvider',
      entityId: id,
      previousValue: toJsonSafe({ type: before.type, name: before.name }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  // Secao 4 da Fase 84 -- sempre reaproveita VehicleMaintenance (nenhuma
  // segunda fonte de custo/OS). 3 agregacoes em paralelo, O(1) independente
  // do volume de OS.
  async getSummary(tenantId: string, id: string): Promise<MaintenanceProviderSummaryEntity> {
    await this.findOwnedOrThrow(tenantId, id);

    const where: Prisma.VehicleMaintenanceWhereInput = { tenantId, OR: [{ workshopId: id }, { supplierId: id }] };

    const [osCount, vehicleRows, totalAgg, lastRow] = await Promise.all([
      this.prisma.vehicleMaintenance.count({ where }),
      this.prisma.vehicleMaintenance.findMany({ where, distinct: ['vehicleId'], select: { vehicleId: true } }),
      this.prisma.vehicleMaintenance.aggregate({ where, _sum: { totalCost: true } }),
      this.prisma.vehicleMaintenance.findFirst({ where, orderBy: { openedAt: 'desc' }, select: { openedAt: true } }),
    ]);

    const entity = new MaintenanceProviderSummaryEntity();
    entity.osCount = osCount;
    entity.vehiclesServedCount = vehicleRows.length;
    entity.totalCost = totalAgg._sum.totalCost !== null ? Number(totalAgg._sum.totalCost) : null;
    entity.lastUsedAt = lastRow?.openedAt ?? null;
    return entity;
  }

  // Reutilizado por MaintenancesService para validar workshopId/supplierId
  // ao criar/atualizar uma OS: pertence ao tenant, tipo correto, e ativo
  // (secao 8 da Fase 84 -- "validacao de entidade ativa quando a associacao
  // exigir").
  async assertActiveProviderOfType(
    tenantId: string,
    id: string,
    expectedType: MaintenanceProviderType,
  ): Promise<void> {
    const provider = await this.prisma.maintenanceProvider.findFirst({ where: { id, tenantId } });
    if (!provider) {
      throw new NotFoundException(
        `${expectedType === MaintenanceProviderType.WORKSHOP ? 'Oficina' : 'Fornecedor'} nao encontrada(o) nesta empresa.`,
      );
    }
    if (provider.type !== expectedType) {
      throw new ConflictException(
        `O cadastro informado nao e do tipo esperado (${TYPE_LABEL[expectedType]}).`,
      );
    }
    if (!provider.isActive) {
      throw new ConflictException(
        `Nao e possivel associar: ${TYPE_LABEL[provider.type]} "${provider.name}" esta inativa(o).`,
      );
    }
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<MaintenanceProvider> {
    const provider = await this.prisma.maintenanceProvider.findFirst({ where: { id, tenantId } });
    if (!provider) {
      throw new NotFoundException('Oficina/fornecedor nao encontrado nesta empresa.');
    }
    return provider;
  }

  private async assertDocumentAvailable(
    tenantId: string,
    type: MaintenanceProviderType,
    document: string,
  ): Promise<void> {
    const existing = await this.prisma.maintenanceProvider.findUnique({
      where: { tenantId_type_document: { tenantId, type, document } },
    });
    if (existing) {
      throw new ConflictException(
        `Ja existe uma ${TYPE_LABEL[type]} com este documento nesta empresa.`,
      );
    }
  }
}
