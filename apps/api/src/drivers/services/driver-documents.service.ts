import { Injectable } from '@nestjs/common';
import { DocumentOwnerType } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDriverDocumentDto } from '../dto/create-driver-document.dto';
import { DriverDocumentEntity } from '../entities/driver-document.entity';
import { toDriverDocumentEntity } from '../mappers/driver-document.mapper';
import { DriversService } from './drivers.service';

// So o registro/metadado do documento -- sem upload de arquivo (Attachment
// fica para uma fase futura). Reaproveita DriversService.findActiveOrThrow
// para garantir que o motorista existe E pertence ao tenant antes de
// criar/listar qualquer documento (mesma garantia de isolamento).
@Injectable()
export class DriverDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly driversService: DriversService,
  ) {}

  async create(
    tenantId: string,
    driverId: string,
    dto: CreateDriverDocumentDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<DriverDocumentEntity> {
    await this.driversService.findActiveOrThrow(tenantId, driverId);

    const document = await this.prisma.document.create({
      data: {
        tenantId,
        type: dto.type,
        ownerType: DocumentOwnerType.DRIVER,
        ownerId: driverId,
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
      action: 'driver.document_created',
      entityName: 'Document',
      entityId: document.id,
      newValue: toJsonSafe({ driverId, type: document.type, number: document.number }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toDriverDocumentEntity(document);
  }

  async findAll(tenantId: string, driverId: string): Promise<DriverDocumentEntity[]> {
    await this.driversService.findActiveOrThrow(tenantId, driverId);

    const documents = await this.prisma.document.findMany({
      where: { tenantId, ownerType: DocumentOwnerType.DRIVER, ownerId: driverId },
      orderBy: { createdAt: 'desc' },
    });

    return documents.map(toDriverDocumentEntity);
  }
}
