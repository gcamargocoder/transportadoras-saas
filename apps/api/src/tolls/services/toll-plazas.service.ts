import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TollPlaza } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTollPlazaDto } from '../dto/create-toll-plaza.dto';
import { FindTollPlazasQueryDto } from '../dto/find-toll-plazas-query.dto';
import { UpdateTollPlazaDto } from '../dto/update-toll-plaza.dto';
import { PaginatedTollPlazasEntity } from '../entities/paginated-toll-plazas.entity';
import { TollPlazaEntity } from '../entities/toll-plaza.entity';
import { toTollPlazaEntity } from '../mappers/toll-plaza.mapper';

// TollPlaza e dado de referencia GLOBAL (sem tenantId) -- mesmo padrao ja
// usado em TagProvider (Fase 14): leitura aberta, escrita restrita a
// SUPER_ADMIN, auditoria gravada com o tenant do PROPRIO ATOR (nao existe
// "tenant da praca").
@Injectable()
export class TollPlazasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: FindTollPlazasQueryDto): Promise<PaginatedTollPlazasEntity> {
    const where: Prisma.TollPlazaWhereInput = {
      ...(query.state ? { state: query.state.toUpperCase() } : {}),
      ...(query.operator
        ? { operator: { contains: query.operator, mode: Prisma.QueryMode.insensitive } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { operator: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { highway: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { city: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tollPlaza.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tollPlaza.count({ where }),
    ]);

    const result = new PaginatedTollPlazasEntity();
    result.items = items.map(toTollPlazaEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(id: string): Promise<TollPlazaEntity> {
    return toTollPlazaEntity(await this.findOrThrow(id));
  }

  async create(
    dto: CreateTollPlazaDto,
    actorTenantId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TollPlazaEntity> {
    const plaza = await this.prisma.tollPlaza.create({
      data: {
        name: dto.name,
        operator: dto.operator,
        ...compact({
          highway: dto.highway,
          km: dto.km,
          city: dto.city,
          state: dto.state?.toUpperCase(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          pricePerAxle: dto.pricePerAxle,
        }),
      },
    });

    await this.audit.log({
      tenantId: actorTenantId,
      userId: actor.userId,
      action: 'toll_plaza.created',
      entityName: 'TollPlaza',
      entityId: plaza.id,
      newValue: toJsonSafe({ name: plaza.name, operator: plaza.operator }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTollPlazaEntity(plaza);
  }

  async update(
    id: string,
    dto: UpdateTollPlazaDto,
    actorTenantId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TollPlazaEntity> {
    const before = await this.findOrThrow(id);

    const plaza = await this.prisma.tollPlaza.update({
      where: { id },
      data: compact({
        name: dto.name,
        operator: dto.operator,
        highway: dto.highway,
        km: dto.km,
        city: dto.city,
        state: dto.state?.toUpperCase(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        pricePerAxle: dto.pricePerAxle,
      }),
    });

    await this.audit.log({
      tenantId: actorTenantId,
      userId: actor.userId,
      action: 'toll_plaza.updated',
      entityName: 'TollPlaza',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(plaza),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTollPlazaEntity(plaza);
  }

  async remove(
    id: string,
    actorTenantId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOrThrow(id);

    const [transactionsCount, ratesCount, predictionsCount] = await Promise.all([
      this.prisma.tollTransaction.count({ where: { tollPlazaId: id } }),
      this.prisma.tollRate.count({ where: { tollPlazaId: id } }),
      this.prisma.tollPrediction.count({ where: { tollPlazaId: id } }),
    ]);
    if (transactionsCount > 0 || ratesCount > 0 || predictionsCount > 0) {
      throw new ConflictException(
        'Nao e possivel excluir esta praca: existem registros vinculados ' +
          `(transacoes: ${transactionsCount}, tarifas: ${ratesCount}, previsoes: ${predictionsCount}). ` +
          'Remova-os antes de excluir a praca.',
      );
    }

    await this.prisma.tollPlaza.delete({ where: { id } });

    await this.audit.log({
      tenantId: actorTenantId,
      userId: actor.userId,
      action: 'toll_plaza.deleted',
      entityName: 'TollPlaza',
      entityId: id,
      previousValue: toJsonSafe({ name: before.name, operator: before.operator }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  async findOrThrow(id: string): Promise<TollPlaza> {
    const plaza = await this.prisma.tollPlaza.findUnique({ where: { id } });
    if (!plaza) {
      throw new NotFoundException('Praca de pedagio nao encontrada.');
    }
    return plaza;
  }
}
