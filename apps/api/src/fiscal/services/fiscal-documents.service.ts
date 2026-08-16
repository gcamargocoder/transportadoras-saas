import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname } from 'path';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FiscalDocumentSource, FiscalDocumentStatus, FiscalDocumentType, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { toAuditLogEntity } from '../../audit/mappers/audit-log.mapper';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { assertValidFileSignature } from '../../common/utils/file-signature.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { getStorageUsedBytes, assertStorageUnderLimit, runSerializable } from '../../tenants/utils/plan-limit.util';
import { PLAN_ERRORS } from '../../tenants/constants/plan-error.constants';
import { EXTENSION_TO_FILE_SIGNATURE_KIND } from '../constants/fiscal-file.constants';
import { FindFiscalDocumentsQueryDto } from '../dto/find-fiscal-documents-query.dto';
import { ImportFiscalXmlDto } from '../dto/import-fiscal-xml.dto';
import { UpdateFiscalDocumentDto } from '../dto/update-fiscal-document.dto';
import { UploadFiscalDocumentDto } from '../dto/upload-fiscal-document.dto';
import { FiscalDashboardEntity, FiscalDocumentStatusCountEntity, FiscalDocumentTypeCountEntity, FiscalIssueCountEntity } from '../entities/fiscal-dashboard.entity';
import { FiscalDocumentEntity } from '../entities/fiscal-document.entity';
import { PaginatedFiscalDocumentsEntity } from '../entities/paginated-fiscal-documents.entity';
import { TripDocumentStatusEntity } from '../entities/trip-document-status.entity';
import { toFiscalDocumentEntity, FiscalDocumentWithRelations } from '../mappers/fiscal-document.mapper';
import { normalizeAccessKey } from '../utils/access-key.util';
import { classifyFiscalDocumentIssues, FiscalDocumentIssueInput, FiscalIssueCode, isWellFormedXml } from '../utils/fiscal-document-validation.util';
import { parseFiscalXml } from '../utils/fiscal-xml.parser';
import { aggregateMonthlySeries } from '../../common/utils/monthly-series.util';

const PROBLEMATIC_DOCUMENTS_LIMIT = 10;

const FISCAL_DOCUMENT_INCLUDE = {
  trip: { include: { origin: true, destination: true, composition: { select: { vehicleId: true } } } },
  vehicle: true,
  driver: true,
  customer: true,
  creator: true,
  updater: true,
} satisfies Prisma.FiscalDocumentInclude;

interface LinkFields {
  tripId?: string | undefined;
  vehicleId?: string | undefined;
  driverId?: string | undefined;
  customerId?: string | undefined;
}

@Injectable()
export class FiscalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, query: FindFiscalDocumentsQueryDto): Promise<PaginatedFiscalDocumentsEntity> {
    const where = this.buildWhere(tenantId, query);

    // Fase 54 -- getDuplicateGroupKeys roda em paralelo com a propria
    // listagem: 1 unica query agregada (groupBy) por chamada, nunca 1 por
    // linha da pagina (evita N+1 mesmo com paginas maiores).
    const [items, total, duplicateKeys] = await Promise.all([
      this.prisma.fiscalDocument.findMany({
        where,
        include: FISCAL_DOCUMENT_INCLUDE,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.fiscalDocument.count({ where }),
      this.getDuplicateGroupKeys(tenantId),
    ]);

    const result = new PaginatedFiscalDocumentsEntity();
    result.items = items.map((document) => this.attachValidationIssues(toFiscalDocumentEntity(document), document, duplicateKeys));
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<FiscalDocumentEntity> {
    return this.buildEntityWithIssues(tenantId, await this.findOwnedOrThrow(tenantId, id));
  }

  // POST /fiscal/documents/upload -- upload direto (PDF/XML/JPG/JPEG/PNG),
  // sem parser: todos os metadados vem do formulario (dto), nunca extraidos
  // do arquivo. Duplicidade por accessKey (quando informada) e REJEITADA
  // (upload manual repetido e mais provavelmente um erro do usuario, nunca
  // silenciosamente ignorado -- distinto de importXml, ver comentario la).
  async upload(
    tenantId: string,
    dto: UploadFiscalDocumentDto,
    file: Express.Multer.File,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FiscalDocumentEntity> {
    try {
      const kind = EXTENSION_TO_FILE_SIGNATURE_KIND[extname(file.originalname).toLowerCase()];
      if (!kind) {
        throw new BadRequestException('Extensao de arquivo nao suportada.');
      }
      await assertValidFileSignature(file.path, kind);

      await this.assertLinkedEntitiesExist(tenantId, dto);

      const accessKey = normalizeAccessKey(dto.accessKey);
      if (dto.accessKey && !accessKey) {
        throw new BadRequestException('accessKey invalida -- esperado 44 digitos.');
      }
      const issueDate = dto.issueDate ? new Date(dto.issueDate) : null;
      await this.assertNoDuplicate(tenantId, {
        accessKey,
        documentType: dto.documentType,
        documentNumber: dto.documentNumber ?? null,
        series: dto.series ?? null,
        issueDate,
      });

      const id = randomUUID();
      const document = await runSerializable(this.prisma, async (tx) => {
        const plan = await tx.tenantPlan.findUnique({ where: { tenantId } });
        const usedBytes = await getStorageUsedBytes(tx, tenantId);
        assertStorageUnderLimit(usedBytes, file.size, plan?.maxStorageMb, PLAN_ERRORS.STORAGE_LIMIT_REACHED);

        const attachment = await tx.attachment.create({
          data: {
            tenantId,
            entityName: 'FiscalDocument',
            entityId: id,
            storageKey: file.filename,
            uploadedById: actor.userId,
            sizeBytes: file.size,
          },
        });

        return tx.fiscalDocument.create({
          data: {
            id,
            tenantId,
            documentType: dto.documentType,
            status: FiscalDocumentStatus.PENDING,
            source: FiscalDocumentSource.UPLOAD,
            attachmentId: attachment.id,
            fileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            createdBy: actor.userId,
            ...compact({
              documentNumber: dto.documentNumber,
              accessKey,
              series: dto.series,
              issueDate,
              senderName: dto.senderName,
              senderDocument: dto.senderDocument,
              recipientName: dto.recipientName,
              recipientDocument: dto.recipientDocument,
              tripId: dto.tripId,
              vehicleId: dto.vehicleId,
              driverId: dto.driverId,
              customerId: dto.customerId,
            }),
          },
          include: FISCAL_DOCUMENT_INCLUDE,
        });
      });

      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'fiscal.document_uploaded',
        entityName: 'FiscalDocument',
        entityId: document.id,
        newValue: toJsonSafe({ documentType: document.documentType, fileName: document.fileName, source: document.source }),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });

      return this.buildEntityWithIssues(tenantId, document);
    } catch (error) {
      await fs.unlink(file.path).catch(() => undefined);
      throw error;
    }
  }

  // POST /fiscal/documents/import -- so XML (a rota de upload aceita as 5
  // extensoes, mas importacao com parser so faz sentido para XML). Todos os
  // metadados sao extraidos do XML (parseFiscalXml) -- o cliente so informa
  // vinculo operacional opcional. Reimportar o MESMO XML (mesma accessKey)
  // e IDEMPOTENTE: retorna o documento ja existente, nunca cria um segundo
  // (secao 5 do pedido -- "importacao repetida deve ser idempotente").
  async importXml(
    tenantId: string,
    dto: ImportFiscalXmlDto,
    file: Express.Multer.File,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FiscalDocumentEntity> {
    try {
      if (extname(file.originalname).toLowerCase() !== '.xml') {
        throw new BadRequestException('POST /fiscal/documents/import aceita somente arquivos .xml.');
      }
      await assertValidFileSignature(file.path, 'XML');

      await this.assertLinkedEntitiesExist(tenantId, dto);

      const xmlContent = await fs.readFile(file.path, 'utf8');
      // Fase 54 -- mensagem distinta para XML malformado (tags desbalanceadas
      // etc.) vs. XML bem-formado mas de tipo nao reconhecido -- ajuda o
      // usuario a diferenciar "arquivo corrompido" de "nao e NF-e/CT-e/MDF-e".
      // Nenhum dos dois casos e persistido (ver FiscalIssueCountEntity).
      if (!isWellFormedXml(xmlContent)) {
        throw new BadRequestException('Arquivo XML malformado (tags desbalanceadas). Nenhuma validacao SEFAZ e feita -- so a estrutura basica do XML.');
      }
      const parsed = parseFiscalXml(xmlContent);
      if (!parsed) {
        throw new BadRequestException(
          'Nao foi possivel identificar o tipo do documento (esperado NF-e/CT-e/MDF-e). Nenhuma validacao SEFAZ e feita -- so a estrutura basica do XML.',
        );
      }

      const accessKey = normalizeAccessKey(parsed.accessKey);
      const duplicate = await this.findDuplicate(tenantId, {
        accessKey,
        documentType: parsed.documentType,
        documentNumber: parsed.documentNumber,
        series: parsed.series,
        issueDate: parsed.issueDate,
      });
      if (duplicate) {
        // Idempotente: nao cria um segundo registro nem duplica o arquivo em
        // disco -- o arquivo recem-salvo pelo multer e descartado no finally.
        return this.buildEntityWithIssues(tenantId, duplicate);
      }

      const id = randomUUID();
      const metadataJson: Record<string, unknown> = compact({ amount: parsed.amount ?? undefined });

      const document = await runSerializable(this.prisma, async (tx) => {
        const plan = await tx.tenantPlan.findUnique({ where: { tenantId } });
        const usedBytes = await getStorageUsedBytes(tx, tenantId);
        assertStorageUnderLimit(usedBytes, file.size, plan?.maxStorageMb, PLAN_ERRORS.STORAGE_LIMIT_REACHED);

        const attachment = await tx.attachment.create({
          data: {
            tenantId,
            entityName: 'FiscalDocument',
            entityId: id,
            storageKey: file.filename,
            uploadedById: actor.userId,
            sizeBytes: file.size,
          },
        });

        return tx.fiscalDocument.create({
          data: {
            id,
            tenantId,
            documentType: parsed.documentType,
            status: FiscalDocumentStatus.VALID,
            source: FiscalDocumentSource.XML_IMPORT,
            attachmentId: attachment.id,
            fileName: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            ...(Object.keys(metadataJson).length > 0 ? { metadata: metadataJson as Prisma.InputJsonValue } : {}),
            createdBy: actor.userId,
            ...compact({
              documentNumber: parsed.documentNumber,
              accessKey,
              series: parsed.series,
              issueDate: parsed.issueDate,
              senderName: parsed.senderName,
              senderDocument: parsed.senderDocument,
              recipientName: parsed.recipientName,
              recipientDocument: parsed.recipientDocument,
              tripId: dto.tripId,
              vehicleId: dto.vehicleId,
              driverId: dto.driverId,
              customerId: dto.customerId,
            }),
          },
          include: FISCAL_DOCUMENT_INCLUDE,
        });
      });

      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'fiscal.document_imported',
        entityName: 'FiscalDocument',
        entityId: document.id,
        newValue: toJsonSafe({ documentType: document.documentType, accessKey: document.accessKey, source: document.source }),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });

      return this.buildEntityWithIssues(tenantId, document);
    } finally {
      await fs.unlink(file.path).catch(() => undefined);
    }
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateFiscalDocumentDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FiscalDocumentEntity> {
    const before = await this.findOwnedOrThrow(tenantId, id);
    await this.assertLinkedEntitiesExist(tenantId, {
      tripId: dto.tripId ?? undefined,
      vehicleId: dto.vehicleId ?? undefined,
      driverId: dto.driverId ?? undefined,
      customerId: dto.customerId ?? undefined,
    });

    const wasLinked = this.isLinked(dto);

    const document = await this.prisma.fiscalDocument.update({
      where: { id },
      data: {
        ...compact({
          status: dto.status,
          documentNumber: dto.documentNumber,
          series: dto.series,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          senderName: dto.senderName,
          senderDocument: dto.senderDocument,
          recipientName: dto.recipientName,
          recipientDocument: dto.recipientDocument,
          tripId: dto.tripId,
          vehicleId: dto.vehicleId,
          driverId: dto.driverId,
          customerId: dto.customerId,
        }),
        updatedBy: actor.userId,
      },
      include: FISCAL_DOCUMENT_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: wasLinked ? 'fiscal.document_linked' : 'fiscal.document_updated',
      entityName: 'FiscalDocument',
      entityId: id,
      previousValue: toJsonSafe(before),
      newValue: toJsonSafe(document),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return this.buildEntityWithIssues(tenantId, document);
  }

  async remove(tenantId: string, id: string, actor: AuditActor, metadata: RequestMetadata): Promise<void> {
    const before = await this.findOwnedOrThrow(tenantId, id);

    await this.prisma.fiscalDocument.delete({ where: { id } });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'fiscal.document_deleted',
      entityName: 'FiscalDocument',
      entityId: id,
      previousValue: toJsonSafe({ documentType: before.documentType, documentNumber: before.documentNumber, accessKey: before.accessKey }),
      newValue: null,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });
  }

  // Fase 53 -- aceita o MESMO filtro da listagem (FindFiscalDocumentsQueryDto,
  // reaproveitando buildWhere) para que todos os indicadores respeitem
  // exatamente o escopo/tenant/filtros ja usados pelo modulo (secao 3 do
  // pedido). page/pageSize/sortBy/sortOrder do DTO sao ignorados aqui (o
  // dashboard nunca pagina, so agrega).
  async getDashboard(tenantId: string, query: FindFiscalDocumentsQueryDto): Promise<FiscalDashboardEntity> {
    const where = this.buildWhere(tenantId, query);
    // AND (nunca spread-override): "where" pode ja conter tripId/vehicleId/
    // driverId/customerId/status especificos vindos do filtro do usuario --
    // sobrescrever esses campos silenciosamente ignoraria o filtro (nunca
    // respeitaria "todos os indicadores no mesmo escopo"). Com AND, um
    // filtro que ja exige vinculo (ex: tripId=X) corretamente zera
    // unlinkedCount (contradicao logica com tripId=null), e um filtro de
    // status especifico corretamente zera problematicDocuments quando o
    // status filtrado nao e PENDING/INVALID.
    const unlinkedWhere: Prisma.FiscalDocumentWhereInput = {
      AND: [where, { tripId: null, vehicleId: null, driverId: null, customerId: null }],
    };

    // Fase 54 -- classificationRows substitui o antigo dateRows (so
    // issueDate/createdAt): agora traz todos os campos que
    // classifyFiscalDocumentIssues precisa, calculado em memoria sobre o
    // MESMO lote ja carregado para monthlyEvolution -- zero query extra por
    // documento. duplicateKeys roda em paralelo (1 unica query agregada,
    // escopo tenant inteiro -- duplicidade e uma questao de integridade de
    // dados, independente do filtro de visualizacao do dashboard).
    const [total, byTypeRaw, byStatusRaw, unlinkedCount, classificationRows, duplicateKeys] = await Promise.all([
      this.prisma.fiscalDocument.count({ where }),
      this.prisma.fiscalDocument.groupBy({ by: ['documentType'], where, _count: { _all: true } }),
      this.prisma.fiscalDocument.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.fiscalDocument.count({ where: unlinkedWhere }),
      this.prisma.fiscalDocument.findMany({
        where,
        select: {
          id: true,
          issueDate: true,
          createdAt: true,
          status: true,
          documentType: true,
          source: true,
          accessKey: true,
          documentNumber: true,
          series: true,
          senderName: true,
          senderDocument: true,
          recipientName: true,
          recipientDocument: true,
          tripId: true,
          vehicleId: true,
          driverId: true,
          customerId: true,
          trip: { select: { driverId: true, composition: { select: { vehicleId: true } } } },
        },
      }),
      this.getDuplicateGroupKeys(tenantId),
    ]);

    const issuesById = new Map<string, FiscalIssueCode[]>();
    for (const row of classificationRows) {
      const key = this.buildDuplicateKey(row.documentType, row.documentNumber, row.series);
      const issues = classifyFiscalDocumentIssues({
        documentType: row.documentType,
        source: row.source,
        accessKey: row.accessKey,
        documentNumber: row.documentNumber,
        series: row.series,
        issueDate: row.issueDate,
        senderName: row.senderName,
        senderDocument: row.senderDocument,
        recipientName: row.recipientName,
        recipientDocument: row.recipientDocument,
        tripId: row.tripId,
        vehicleId: row.vehicleId,
        driverId: row.driverId,
        customerId: row.customerId,
        hasDuplicateCandidate: key !== null && duplicateKeys.has(key),
        tripVehicleId: row.trip?.composition?.vehicleId ?? null,
        tripDriverId: row.trip?.driverId ?? null,
      });
      issuesById.set(row.id, issues);
    }

    const alertCounts = new Map<FiscalIssueCode, number>();
    for (const issues of issuesById.values()) {
      for (const code of issues) {
        alertCounts.set(code, (alertCounts.get(code) ?? 0) + 1);
      }
    }
    const alerts: FiscalIssueCountEntity[] = Array.from(alertCounts.entries()).map(([code, count]) => {
      const entry = new FiscalIssueCountEntity();
      entry.code = code;
      entry.count = count;
      return entry;
    });

    // Criterio ampliado (secao 2 do pedido): PENDING/INVALID (como na Fase
    // 53) OU 1+ inconsistencia estrutural, mesmo que VALID/CANCELLED.
    const problematicIds = classificationRows
      .filter((row) => row.status === FiscalDocumentStatus.PENDING || row.status === FiscalDocumentStatus.INVALID || (issuesById.get(row.id)?.length ?? 0) > 0)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, PROBLEMATIC_DOCUMENTS_LIMIT)
      .map((row) => row.id);

    const problematicRows =
      problematicIds.length > 0
        ? await this.prisma.fiscalDocument.findMany({
            where: { id: { in: problematicIds } },
            include: FISCAL_DOCUMENT_INCLUDE,
          })
        : [];
    const problematicById = new Map(problematicRows.map((row) => [row.id, row]));

    const byType: FiscalDocumentTypeCountEntity[] = byTypeRaw
      .map((row) => {
        const entry = new FiscalDocumentTypeCountEntity();
        entry.type = row.documentType;
        entry.count = row._count._all;
        return entry;
      })
      .sort((a, b) => b.count - a.count);
    const byStatus: FiscalDocumentStatusCountEntity[] = byStatusRaw.map((row) => {
      const entry = new FiscalDocumentStatusCountEntity();
      entry.status = row.status;
      entry.count = row._count._all;
      return entry;
    });

    const countByType = (type: string): number => byType.find((b) => b.type === type)?.count ?? 0;
    const countByStatus = (status: string): number => byStatus.find((b) => b.status === status)?.count ?? 0;

    const entity = new FiscalDashboardEntity();
    entity.totalDocuments = total;
    entity.cteCount = countByType('CTE');
    entity.mdfeCount = countByType('MDFE');
    entity.nfeCount = countByType('NFE');
    entity.ciotCount = countByType('CIOT');
    entity.pendingCount = countByStatus('PENDING');
    entity.validCount = countByStatus('VALID');
    entity.invalidCount = countByStatus('INVALID');
    entity.cancelledCount = countByStatus('CANCELLED');
    entity.unlinkedCount = unlinkedCount;
    entity.linkedCount = total - unlinkedCount;
    entity.byType = byType;
    entity.byStatus = byStatus;
    entity.problematicDocuments = problematicIds
      .map((id) => problematicById.get(id))
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .map((row) => {
        const docEntity = toFiscalDocumentEntity(row);
        docEntity.validationIssues = issuesById.get(row.id) ?? [];
        return docEntity;
      });
    entity.alerts = alerts;
    entity.monthlyEvolution = aggregateMonthlySeries(
      classificationRows.map((row) => ({ date: row.issueDate ?? row.createdAt, value: 1 })),
      12,
    );
    return entity;
  }

  // GET /fiscal/documents/trip/:tripId/status (Fase 53, secao 2) -- visao
  // consolidada da situacao documental de UMA viagem. "Tipos ausentes" e
  // so o complemento do catalogo -- nunca uma lista de documentos
  // obrigatorios (regra de negocio inexistente no projeto).
  async getTripDocumentStatus(tenantId: string, tripId: string): Promise<TripDocumentStatusEntity> {
    await this.assertLinkedEntitiesExist(tenantId, { tripId });

    // Fase 54 -- documentos de 1 viagem sao um conjunto naturalmente
    // pequeno: 1 findMany completo + 1 groupBy de duplicidade (tenant
    // inteiro, mas 1 unica query agregada) bastam para tudo -- substitui os
    // 3 groupBy separados da Fase 53 (agora calculados em memoria a partir
    // do mesmo lote, sem aumentar o numero de queries por documento).
    const [documents, duplicateKeys] = await Promise.all([
      this.prisma.fiscalDocument.findMany({ where: { tenantId, tripId }, include: FISCAL_DOCUMENT_INCLUDE }),
      this.getDuplicateGroupKeys(tenantId),
    ]);

    const items = documents.map((document) => this.attachValidationIssues(toFiscalDocumentEntity(document), document, duplicateKeys));

    const countByStatus = (status: FiscalDocumentStatus): number => documents.filter((d) => d.status === status).length;
    const presentTypes = Array.from(new Set(documents.map((d) => d.documentType)));
    const allTypes = Object.values(FiscalDocumentType);

    const problematic = items
      .filter((item) => item.status === FiscalDocumentStatus.PENDING || item.status === FiscalDocumentStatus.INVALID || item.validationIssues.length > 0)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const entity = new TripDocumentStatusEntity();
    entity.tripId = tripId;
    entity.totalDocuments = documents.length;
    entity.pendingCount = countByStatus(FiscalDocumentStatus.PENDING);
    entity.validCount = countByStatus(FiscalDocumentStatus.VALID);
    entity.invalidCount = countByStatus(FiscalDocumentStatus.INVALID);
    entity.cancelledCount = countByStatus(FiscalDocumentStatus.CANCELLED);
    entity.presentTypes = presentTypes;
    entity.absentTypes = allTypes.filter((t) => !presentTypes.includes(t));
    entity.structurallyValidCount = items.filter((item) => item.status === FiscalDocumentStatus.VALID && item.validationIssues.length === 0).length;
    entity.problematicCount = problematic.length;
    entity.problematicDocuments = problematic;
    // Nunca inventa percentual -- ver comentario em TripDocumentStatusEntity.
    entity.completenessPercent = null;
    entity.completenessAvailable = false;
    return entity;
  }

  // GET /fiscal/documents/:id/history (Fase 53, secao 4) -- reaproveita
  // AuditService.findByEntity, mesmo padrao de VehiclesService.getHistory/
  // TiresService (nunca um sistema de auditoria paralelo).
  async getHistory(tenantId: string, id: string, pagination: PaginationQueryDto): Promise<PaginatedAuditLogEntity> {
    await this.findOwnedOrThrow(tenantId, id);

    const { items, total } = await this.audit.findByEntity(tenantId, 'FiscalDocument', id, pagination);

    const result = new PaginatedAuditLogEntity();
    result.items = items.map(toAuditLogEntity);
    result.meta = buildPaginationMeta(total, pagination.page, pagination.pageSize);
    return result;
  }

  private buildWhere(tenantId: string, query: FindFiscalDocumentsQueryDto): Prisma.FiscalDocumentWhereInput {
    const dateRange =
      query.issueDateFrom || query.issueDateTo
        ? compact({
            gte: query.issueDateFrom ? new Date(query.issueDateFrom) : undefined,
            lte: query.issueDateTo ? new Date(query.issueDateTo) : undefined,
          })
        : undefined;

    return {
      tenantId,
      ...compact({
        documentType: query.documentType,
        status: query.status,
        documentNumber: query.documentNumber,
        accessKey: query.accessKey,
        tripId: query.tripId,
        vehicleId: query.vehicleId,
        driverId: query.driverId,
        customerId: query.customerId,
        issueDate: dateRange,
      }),
      ...(query.unlinkedOnly ? { tripId: null, vehicleId: null, driverId: null, customerId: null } : {}),
    };
  }

  private isLinked(dto: UpdateFiscalDocumentDto): boolean {
    return dto.tripId !== undefined || dto.vehicleId !== undefined || dto.driverId !== undefined || dto.customerId !== undefined;
  }

  private async assertLinkedEntitiesExist(tenantId: string, fields: LinkFields): Promise<void> {
    const checks: Promise<void>[] = [];
    if (fields.tripId) {
      checks.push(
        this.prisma.trip.findFirst({ where: { id: fields.tripId, tenantId, deletedAt: null } }).then((trip) => {
          if (!trip) throw new NotFoundException('Viagem (tripId) nao encontrada nesta empresa.');
        }),
      );
    }
    if (fields.vehicleId) {
      checks.push(
        this.prisma.vehicle.findFirst({ where: { id: fields.vehicleId, tenantId, deletedAt: null } }).then((vehicle) => {
          if (!vehicle) throw new NotFoundException('Veiculo (vehicleId) nao encontrado nesta empresa.');
        }),
      );
    }
    if (fields.driverId) {
      checks.push(
        this.prisma.driver.findFirst({ where: { id: fields.driverId, tenantId, deletedAt: null } }).then((driver) => {
          if (!driver) throw new NotFoundException('Motorista (driverId) nao encontrado nesta empresa.');
        }),
      );
    }
    if (fields.customerId) {
      checks.push(
        this.prisma.customer.findFirst({ where: { id: fields.customerId, tenantId } }).then((customer) => {
          if (!customer) throw new NotFoundException('Cliente (customerId) nao encontrado nesta empresa.');
        }),
      );
    }
    await Promise.all(checks);
  }

  // Upload manual: duplicidade por accessKey (ou, na ausencia dela, pela
  // combinacao documentType+documentNumber+series+issueDate) e REJEITADA --
  // ver comentario no metodo upload().
  private async assertNoDuplicate(
    tenantId: string,
    fields: { accessKey: string | null; documentType: string; documentNumber: string | null; series: string | null; issueDate: Date | null },
  ): Promise<void> {
    const duplicate = await this.findDuplicate(tenantId, fields);
    if (duplicate) {
      throw new ConflictException('Ja existe um documento fiscal com esta chave de acesso/identificacao nesta empresa.');
    }
  }

  private async findDuplicate(
    tenantId: string,
    fields: { accessKey: string | null; documentType: string; documentNumber: string | null; series: string | null; issueDate: Date | null },
  ): Promise<FiscalDocumentWithRelations | null> {
    if (fields.accessKey) {
      return this.prisma.fiscalDocument.findUnique({
        where: { tenantId_accessKey: { tenantId, accessKey: fields.accessKey } },
        include: FISCAL_DOCUMENT_INCLUDE,
      });
    }
    // Sem chave de acesso: so tenta corresponder quando ha pelo menos um
    // numero de documento -- nunca deduplica com base so em tipo (heuristica
    // fragil demais, secao 5 do pedido).
    if (!fields.documentNumber) return null;
    return this.prisma.fiscalDocument.findFirst({
      where: {
        tenantId,
        documentType: fields.documentType as never,
        documentNumber: fields.documentNumber,
        series: fields.series,
        issueDate: fields.issueDate,
      },
      include: FISCAL_DOCUMENT_INCLUDE,
    });
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<FiscalDocumentWithRelations> {
    const document = await this.prisma.fiscalDocument.findFirst({
      where: { id, tenantId },
      include: FISCAL_DOCUMENT_INCLUDE,
    });
    if (!document) {
      throw new NotFoundException('Documento fiscal nao encontrado nesta empresa.');
    }
    return document;
  }

  // Fase 54 -- monta o input puro para classifyFiscalDocumentIssues a partir
  // de um documento ja carregado (com FISCAL_DOCUMENT_INCLUDE), repassando o
  // vinculo REAL da viagem (composition.vehicleId / driverId) para permitir
  // a checagem de INCONSISTENT_LINK sem nenhuma query adicional.
  private toIssueInput(document: FiscalDocumentWithRelations, hasDuplicateCandidate: boolean): FiscalDocumentIssueInput {
    return {
      documentType: document.documentType,
      source: document.source,
      accessKey: document.accessKey,
      documentNumber: document.documentNumber,
      series: document.series,
      issueDate: document.issueDate,
      senderName: document.senderName,
      senderDocument: document.senderDocument,
      recipientName: document.recipientName,
      recipientDocument: document.recipientDocument,
      tripId: document.tripId,
      vehicleId: document.vehicleId,
      driverId: document.driverId,
      customerId: document.customerId,
      hasDuplicateCandidate,
      tripVehicleId: document.trip?.composition?.vehicleId ?? null,
      tripDriverId: document.trip?.driverId ?? null,
    };
  }

  private attachValidationIssues(
    entity: FiscalDocumentEntity,
    document: FiscalDocumentWithRelations,
    duplicateKeys: Set<string>,
  ): FiscalDocumentEntity {
    const key = this.buildDuplicateKey(document.documentType, document.documentNumber, document.series);
    entity.validationIssues = classifyFiscalDocumentIssues(this.toIssueInput(document, key !== null && duplicateKeys.has(key)));
    return entity;
  }

  private buildDuplicateKey(documentType: string, documentNumber: string | null, series: string | null): string | null {
    if (!documentNumber) return null;
    return `${documentType}|${documentNumber}|${series ?? ''}`;
  }

  // Fase 54 -- usado pelas rotas de escrita (upload/import/update) e por
  // findOne: monta a entity ja com validationIssues calculado para ESTE 1
  // documento (1 count() enxuto de duplicidade, nunca a groupBy do tenant
  // inteiro so para 1 registro -- ver getDuplicateGroupKeys, reservado para
  // contextos em lote).
  private async buildEntityWithIssues(tenantId: string, document: FiscalDocumentWithRelations): Promise<FiscalDocumentEntity> {
    const key = this.buildDuplicateKey(document.documentType, document.documentNumber, document.series);
    const hasDuplicateCandidate = key
      ? (await this.prisma.fiscalDocument.count({
          where: {
            tenantId,
            documentType: document.documentType,
            documentNumber: document.documentNumber,
            series: document.series,
            id: { not: document.id },
          },
        })) > 0
      : false;
    const entity = toFiscalDocumentEntity(document);
    entity.validationIssues = classifyFiscalDocumentIssues(this.toIssueInput(document, hasDuplicateCandidate));
    return entity;
  }

  // Fase 54 -- 1 unica query agregada (groupBy) para descobrir quais
  // combinacoes (tipo, numero, serie) tem 2+ documentos no tenant. Escopo
  // SEMPRE tenant inteiro (duplicidade e integridade de dados, nao depende
  // do filtro de tela) -- reaproveitada por findAll/findOne/dashboard/
  // trip-status, nunca 1 query por documento.
  private async getDuplicateGroupKeys(tenantId: string): Promise<Set<string>> {
    const groups = await this.prisma.fiscalDocument.groupBy({
      by: ['documentType', 'documentNumber', 'series'],
      where: { tenantId, documentNumber: { not: null } },
      _count: { _all: true },
    });
    const keys = new Set<string>();
    for (const group of groups) {
      if (group._count._all > 1 && group.documentNumber) {
        keys.add(`${group.documentType}|${group.documentNumber}|${group.series ?? ''}`);
      }
    }
    return keys;
  }
}
