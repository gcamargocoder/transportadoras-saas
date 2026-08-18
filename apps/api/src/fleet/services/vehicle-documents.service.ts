import { Injectable } from '@nestjs/common';
import { DocumentOwnerType } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVehicleDocumentDto } from '../dto/create-vehicle-document.dto';
import { VehicleDocumentEntity } from '../entities/vehicle-document.entity';
import { toVehicleDocumentEntity } from '../mappers/vehicle-document.mapper';
import { VehiclesService } from './vehicles.service';

// Mesmo padrao de DriverDocumentsService (Fase 6/61) -- reaproveita o
// MESMO model Document (DocumentOwnerType.VEHICLE ja existia no schema,
// so nao tinha service/rota ainda). So o registro/metadado do documento --
// sem upload de arquivo (Attachment fica para uma fase futura).
@Injectable()
export class VehicleDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly vehiclesService: VehiclesService,
  ) {}

  async create(
    tenantId: string,
    vehicleId: string,
    dto: CreateVehicleDocumentDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<VehicleDocumentEntity> {
    await this.vehiclesService.findActiveOrThrow(tenantId, vehicleId);

    const document = await this.prisma.document.create({
      data: {
        tenantId,
        type: dto.type,
        ownerType: DocumentOwnerType.VEHICLE,
        ownerId: vehicleId,
        ...compact({
          number: dto.number,
          issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        }),
      },
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'vehicle.document_created',
      entityName: 'Document',
      entityId: document.id,
      newValue: toJsonSafe({ vehicleId, type: document.type, number: document.number }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toVehicleDocumentEntity(document);
  }

  async findAll(tenantId: string, vehicleId: string): Promise<VehicleDocumentEntity[]> {
    await this.vehiclesService.findActiveOrThrow(tenantId, vehicleId);
    return this.findAllRaw(tenantId, vehicleId);
  }

  // Sem checagem de existencia do veiculo -- reaproveitado internamente por
  // VehicleOverviewService, que ja validou o veiculo antes.
  async findAllRaw(tenantId: string, vehicleId: string): Promise<VehicleDocumentEntity[]> {
    const documents = await this.prisma.document.findMany({
      where: { tenantId, ownerType: DocumentOwnerType.VEHICLE, ownerId: vehicleId },
      orderBy: { createdAt: 'desc' },
    });
    return documents.map(toVehicleDocumentEntity);
  }
}
