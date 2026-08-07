import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVehicleTagDto } from '../dto/create-vehicle-tag.dto';
import { UpdateVehicleTagStatusDto } from '../dto/update-vehicle-tag-status.dto';
import { UpdateVehicleTagDto } from '../dto/update-vehicle-tag.dto';
import { VehicleTagEntity } from '../entities/vehicle-tag.entity';
import { toVehicleTagEntity } from '../mappers/vehicle-tag.mapper';
import { VehiclesService } from './vehicles.service';

// Vinculo veiculo <-> tag de pedagio. Reaproveita VehiclesService para
// garantir que o veiculo existe e pertence ao tenant antes de qualquer
// operacao -- mesma garantia de isolamento usada em DriverDocumentsService.
@Injectable()
export class VehicleTagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly vehiclesService: VehiclesService,
  ) {}

  async findAll(tenantId: string, vehicleId: string): Promise<VehicleTagEntity[]> {
    await this.vehiclesService.findActiveOrThrow(tenantId, vehicleId);

    const tags = await this.prisma.vehicleTag.findMany({
      where: { tenantId, vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    return tags.map(toVehicleTagEntity);
  }

  async create(
    tenantId: string,
    vehicleId: string,
    dto: CreateVehicleTagDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleTagEntity> {
    await this.vehiclesService.findActiveOrThrow(tenantId, vehicleId);

    const provider = await this.prisma.tagProvider.findUnique({ where: { id: dto.tagProviderId } });
    if (!provider) {
      throw new NotFoundException('Operadora de tag (tagProviderId) nao encontrada.');
    }

    const existing = await this.prisma.vehicleTag.findUnique({
      where: {
        tagProviderId_tagNumber: { tagProviderId: dto.tagProviderId, tagNumber: dto.tagNumber },
      },
    });
    if (existing) {
      throw new ConflictException('Este numero de tag ja esta cadastrado para esta operadora.');
    }

    const tag = await this.prisma.vehicleTag.create({
      data: {
        tenantId,
        vehicleId,
        tagProviderId: dto.tagProviderId,
        tagNumber: dto.tagNumber,
        isActive: true,
        ...compact({
          activatedAt: dto.activatedAt ? new Date(dto.activatedAt) : undefined,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle_tag.created',
      entityName: 'VehicleTag',
      entityId: tag.id,
      newValue: toJsonSafe({
        vehicleId,
        tagProviderId: tag.tagProviderId,
        tagNumber: tag.tagNumber,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toVehicleTagEntity(tag);
  }

  async update(
    tenantId: string,
    vehicleId: string,
    tagId: string,
    dto: UpdateVehicleTagDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleTagEntity> {
    const before = await this.findOwnedOrThrow(tenantId, vehicleId, tagId);

    if (dto.tagNumber && dto.tagNumber !== before.tagNumber) {
      const existing = await this.prisma.vehicleTag.findUnique({
        where: {
          tagProviderId_tagNumber: {
            tagProviderId: before.tagProviderId,
            tagNumber: dto.tagNumber,
          },
        },
      });
      if (existing) {
        throw new ConflictException('Este numero de tag ja esta cadastrado para esta operadora.');
      }
    }

    const tag = await this.prisma.vehicleTag.update({
      where: { id: tagId },
      data: compact({
        tagNumber: dto.tagNumber,
        activatedAt: dto.activatedAt ? new Date(dto.activatedAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      }),
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle_tag.updated',
      entityName: 'VehicleTag',
      entityId: tagId,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(tag),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toVehicleTagEntity(tag);
  }

  async updateStatus(
    tenantId: string,
    vehicleId: string,
    tagId: string,
    dto: UpdateVehicleTagStatusDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleTagEntity> {
    const before = await this.findOwnedOrThrow(tenantId, vehicleId, tagId);

    const tag = await this.prisma.vehicleTag.update({
      where: { id: tagId },
      data: { isActive: dto.isActive },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle_tag.status_changed',
      entityName: 'VehicleTag',
      entityId: tagId,
      previousValue: { isActive: before.isActive },
      newValue: { isActive: tag.isActive },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toVehicleTagEntity(tag);
  }

  async remove(
    tenantId: string,
    vehicleId: string,
    tagId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, vehicleId, tagId);

    await this.prisma.vehicleTag.delete({ where: { id: tagId } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle_tag.deleted',
      entityName: 'VehicleTag',
      entityId: tagId,
      previousValue: toJsonSafe({ vehicleId, tagNumber: before.tagNumber }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  private async findOwnedOrThrow(tenantId: string, vehicleId: string, tagId: string) {
    await this.vehiclesService.findActiveOrThrow(tenantId, vehicleId);
    const tag = await this.prisma.vehicleTag.findFirst({
      where: { id: tagId, tenantId, vehicleId },
    });
    if (!tag) {
      throw new NotFoundException('Tag nao encontrada para este veiculo.');
    }
    return tag;
  }
}
