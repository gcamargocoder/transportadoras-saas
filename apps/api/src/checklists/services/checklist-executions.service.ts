import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChecklistExecutionStatus, ChecklistTemplateStatus, Prisma } from '@prisma/client';
import { promises as fs } from 'fs';
import { extname } from 'path';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { assertValidFileSignature, ValidatedFileKind } from '../../common/utils/file-signature.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PLAN_ERRORS } from '../../tenants/constants/plan-error.constants';
import {
  assertStorageUnderLimit,
  getStorageUsedBytes,
  runSerializable,
} from '../../tenants/utils/plan-limit.util';
import { CreateChecklistExecutionDto } from '../dto/create-checklist-execution.dto';
import { FindChecklistExecutionsQueryDto } from '../dto/find-checklist-executions-query.dto';
import { SubmitChecklistAnswersDto } from '../dto/submit-checklist-answers.dto';
import { UploadChecklistEvidenceDto } from '../dto/upload-checklist-evidence.dto';
import { ChecklistAnswersSubmitResultEntity } from '../entities/checklist-answers-submit-result.entity';
import { ChecklistEvidenceEntity } from '../entities/checklist-evidence.entity';
import { ChecklistExecutionEntity } from '../entities/checklist-execution.entity';
import { PaginatedChecklistExecutionsEntity } from '../entities/paginated-checklist-executions.entity';
import {
  ChecklistExecutionWithRelations,
  toChecklistEvidenceEntity,
  toChecklistExecutionEntity,
} from '../mappers/checklist-execution.mapper';
import { hasCriticalNonConformity } from '../utils/checklist-non-conformity.util';
import { ChecklistTemplatesService } from './checklist-templates.service';

const EXECUTION_INCLUDE = {
  answers: { include: { item: true, evidence: true } },
  evidence: true,
} satisfies Prisma.ChecklistExecutionInclude;

// Fase 38 -- uma execucao real de checklist, feita pelo motorista.
// Idempotencia por deviceEventId (mesmo padrao de AxleEventsService/
// TripStopsService), imutabilidade apos COMPLETED (secao 23), respostas
// duplicadas resolvidas por upsert na constraint (executionId, itemId)
// (secao 8 -- o mesmo mecanismo cobre "nao duplicar" E "idempotente").
@Injectable()
export class ChecklistExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly templatesService: ChecklistTemplatesService,
  ) {}

  async create(
    tenantId: string,
    driverId: string,
    dto: CreateChecklistExecutionDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ChecklistExecutionEntity> {
    const existing = await this.prisma.checklistExecution.findFirst({
      where: { tenantId, deviceEventId: dto.deviceEventId },
      include: EXECUTION_INCLUDE,
    });
    if (existing) {
      return toChecklistExecutionEntity(existing);
    }

    const template = await this.templatesService.findRowOrThrow(tenantId, dto.templateId);
    if (template.status !== ChecklistTemplateStatus.PUBLISHED) {
      throw new ConflictException('Somente um template PUBLISHED pode ser usado para iniciar um checklist.');
    }

    // Verificacao de posse por tenant para os 3 vinculos opcionais -- evita
    // que um payload com um id de outro tenant vaze via FK direta (Trip/
    // Vehicle/Trailer tem PK globalmente unica, nao composta com tenantId).
    if (dto.tripId) {
      const trip = await this.prisma.trip.findFirst({ where: { id: dto.tripId, tenantId, deletedAt: null } });
      if (!trip) {
        throw new NotFoundException('Viagem nao encontrada nesta empresa.');
      }
    }
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, tenantId, deletedAt: null } });
      if (!vehicle) {
        throw new NotFoundException('Veiculo nao encontrado nesta empresa.');
      }
    }
    if (dto.trailerId) {
      const trailer = await this.prisma.trailer.findFirst({ where: { id: dto.trailerId, tenantId, deletedAt: null } });
      if (!trailer) {
        throw new NotFoundException('Carreta nao encontrada nesta empresa.');
      }
    }

    const execution = await this.prisma.checklistExecution.create({
      data: {
        tenantId,
        driverId,
        deviceEventId: dto.deviceEventId,
        templateId: template.id,
        templateVersion: template.version,
        ...compact({
          tripId: dto.tripId,
          vehicleId: dto.vehicleId,
          trailerId: dto.trailerId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          address: dto.address,
          odometerKm: dto.odometerKm,
          inspectionLocation: dto.inspectionLocation,
          responsibleName: dto.responsibleName,
        }),
      },
      include: EXECUTION_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'checklist.started',
      entityName: 'ChecklistExecution',
      entityId: execution.id,
      newValue: toJsonSafe({
        templateId: template.id,
        templateVersion: template.version,
        tripId: execution.tripId,
        driverId,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toChecklistExecutionEntity(execution);
  }

  // POST /driver/checklists/:id/answers -- batch upsert por (executionId,
  // itemId): reenvio do mesmo item e idempotente (atualiza o mesmo valor,
  // nunca cria uma segunda linha -- constraint unique no banco garante isso
  // mesmo sob concorrencia). 1 query em lote para descobrir quais respostas
  // ja existiam (para reportar created/updated corretamente), nunca 1 query
  // por resposta.
  async submitAnswers(
    tenantId: string,
    driverId: string,
    executionId: string,
    dto: SubmitChecklistAnswersDto,
  ): Promise<ChecklistAnswersSubmitResultEntity> {
    const execution = await this.findOwnedOrThrow(tenantId, driverId, executionId);
    if (execution.status === ChecklistExecutionStatus.COMPLETED) {
      throw new ConflictException('Este checklist ja foi concluido -- respostas nao podem mais ser alteradas.');
    }

    const itemIds = dto.answers.map((answer) => answer.itemId);
    const validItems = await this.prisma.checklistItem.findMany({
      where: { id: { in: itemIds }, section: { templateId: execution.templateId } },
      select: { id: true },
    });
    const validItemIds = new Set(validItems.map((item) => item.id));
    const invalidItemIds = itemIds.filter((id) => !validItemIds.has(id));
    if (invalidItemIds.length > 0) {
      throw new ConflictException(`Item(ns) nao pertencem ao template desta execucao: ${invalidItemIds.join(', ')}`);
    }

    const existingAnswers = await this.prisma.checklistAnswer.findMany({
      where: { executionId, itemId: { in: itemIds } },
      select: { itemId: true },
    });
    const existingItemIds = new Set(existingAnswers.map((answer) => answer.itemId));

    await this.prisma.$transaction(
      dto.answers.map((answer) => {
        const values = compact({
          booleanValue: answer.booleanValue,
          textValue: answer.textValue,
          numberValue: answer.numberValue,
          selectedValue: answer.selectedValue,
        });
        return this.prisma.checklistAnswer.upsert({
          where: { executionId_itemId: { executionId, itemId: answer.itemId } },
          create: { executionId, itemId: answer.itemId, ...values },
          update: values,
        });
      }),
    );

    const result = new ChecklistAnswersSubmitResultEntity();
    result.created = dto.answers.filter((answer) => !existingItemIds.has(answer.itemId)).length;
    result.updated = dto.answers.filter((answer) => existingItemIds.has(answer.itemId)).length;
    return result;
  }

  // POST /driver/checklists/:id/evidence (Fase 39) -- upload real de
  // foto/assinatura. Idempotente por (executionId, deviceEventId): reenvio
  // (retry apos falha de rede em plena captura) devolve a MESMA evidencia
  // ja gravada, nunca cria um Attachment duplicado em disco. Cria
  // Attachment (mecanismo generico ja existente, nunca um storage novo) e
  // ChecklistEvidence na MESMA transacao -- nunca um Attachment orfao sem
  // evidencia correspondente.
  async addEvidence(
    tenantId: string,
    driverId: string,
    executionId: string,
    dto: UploadChecklistEvidenceDto,
    file: Express.Multer.File,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ChecklistEvidenceEntity> {
    // Fase 46 -- extensao do nome de arquivo (ja validada pelo fileFilter
    // do multer) nunca prova o conteudo real; so .jpg/.jpeg/.png sao
    // aceitas aqui (ALLOWED_CHECKLIST_EVIDENCE_EXTENSIONS). Confere a
    // assinatura binaria do arquivo ja salvo em disco ANTES de qualquer
    // escrita no banco -- apaga e rejeita se nao bater.
    const kind: ValidatedFileKind = extname(file.originalname).toLowerCase() === '.png' ? 'PNG' : 'JPEG';
    try {
      await assertValidFileSignature(file.path, kind);
    } catch (error) {
      await fs.unlink(file.path).catch(() => undefined);
      throw error;
    }

    const execution = await this.findOwnedOrThrow(tenantId, driverId, executionId);

    const existing = await this.prisma.checklistEvidence.findFirst({
      where: { executionId, deviceEventId: dto.deviceEventId },
    });
    if (existing) {
      return toChecklistEvidenceEntity(existing);
    }

    if (execution.status === ChecklistExecutionStatus.COMPLETED) {
      throw new ConflictException('Este checklist ja foi concluido -- novas evidencias nao podem mais ser enviadas.');
    }

    if (dto.answerId && !execution.answers.some((answer) => answer.id === dto.answerId)) {
      throw new NotFoundException('Resposta (answerId) nao encontrada nesta execucao.');
    }
    if (dto.itemId) {
      const item = await this.prisma.checklistItem.findFirst({
        where: { id: dto.itemId, section: { templateId: execution.templateId } },
      });
      if (!item) {
        throw new NotFoundException('Item (itemId) nao pertence ao template desta execucao.');
      }
    }

    // Fase 48 -- limite de armazenamento do plano: checagem + create do
    // Attachment numa unica transacao Serializable, mesmo mecanismo dos
    // limites de usuarios/veiculos/motoristas. O multer ja gravou o arquivo
    // em disco antes deste metodo rodar -- se o limite estourar, o arquivo
    // e apagado (nunca fica persistido/referenciado por um Attachment).
    const evidence = await runSerializable(this.prisma, async (tx) => {
      const plan = await tx.tenantPlan.findUnique({ where: { tenantId } });
      const usedBytes = await getStorageUsedBytes(tx, tenantId);
      assertStorageUnderLimit(usedBytes, file.size, plan?.maxStorageMb, PLAN_ERRORS.STORAGE_LIMIT_REACHED);

      const attachment = await tx.attachment.create({
        data: {
          tenantId,
          entityName: 'ChecklistExecution',
          entityId: executionId,
          storageKey: file.filename,
          uploadedById: actor.userId,
          sizeBytes: file.size,
        },
      });
      return tx.checklistEvidence.create({
        data: {
          tenantId,
          executionId,
          deviceEventId: dto.deviceEventId,
          type: dto.type,
          attachmentId: attachment.id,
          ...compact({
            itemId: dto.itemId,
            answerId: dto.answerId,
            description: dto.description,
            latitude: dto.latitude,
            longitude: dto.longitude,
          }),
        },
      });
    }).catch(async (error: unknown) => {
      await fs.unlink(file.path).catch(() => undefined);
      throw error;
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'checklist.evidence_uploaded',
      entityName: 'ChecklistEvidence',
      entityId: evidence.id,
      newValue: toJsonSafe({ executionId, itemId: evidence.itemId, type: evidence.type }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toChecklistEvidenceEntity(evidence);
  }

  // POST /driver/checklists/:id/complete -- idempotente: reenviar numa
  // execucao ja COMPLETED devolve o estado atual sem revalidar (mesmo
  // padrao de TripStopsService.close). So valida itens obrigatorios/foto na
  // PRIMEIRA conclusao. hasCriticalNonConformity so preserva a informacao
  // (secao 16) -- nunca bloqueia a conclusao.
  async complete(
    tenantId: string,
    driverId: string,
    executionId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ChecklistExecutionEntity> {
    const execution = await this.findOwnedOrThrow(tenantId, driverId, executionId);
    if (execution.status === ChecklistExecutionStatus.COMPLETED) {
      return toChecklistExecutionEntity(execution);
    }

    const template = await this.prisma.checklistTemplate.findUniqueOrThrow({
      where: { id: execution.templateId },
      include: { sections: { include: { items: true } } },
    });
    const requiredItemIds = template.sections.flatMap((section) => section.items.filter((item) => item.required).map((item) => item.id));
    const answeredItemIds = new Set(execution.answers.map((answer) => answer.itemId));
    const missingItemIds = requiredItemIds.filter((id) => !answeredItemIds.has(id));
    if (missingItemIds.length > 0) {
      throw new ConflictException(`Existem itens obrigatorios sem resposta: ${missingItemIds.join(', ')}`);
    }

    // Fase 39 -- itens com requiresPhoto exigem pelo menos 1 evidencia
    // vinculada (via itemId, associacao primaria -- ver comentario no
    // schema) antes da conclusao. Backend e autoridade; o Driver App so
    // oferece UX (secao 13 da Fase 39: "se o backend ja possuir validacao,
    // respeitar o backend").
    const photoRequiredItemIds = template.sections.flatMap((section) =>
      section.items.filter((item) => item.requiresPhoto).map((item) => item.id),
    );
    const itemIdsWithEvidence = new Set(
      execution.evidence.filter((evidence) => evidence.itemId !== null).map((evidence) => evidence.itemId),
    );
    const missingPhotoItemIds = photoRequiredItemIds.filter((id) => !itemIdsWithEvidence.has(id));
    if (missingPhotoItemIds.length > 0) {
      throw new ConflictException(`Existem itens que exigem foto sem evidencia enviada: ${missingPhotoItemIds.join(', ')}`);
    }

    const completedAt = new Date();
    const updated = await this.prisma.checklistExecution.update({
      where: { id: executionId },
      data: { status: ChecklistExecutionStatus.COMPLETED, completedAt },
      include: EXECUTION_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'checklist.completed',
      entityName: 'ChecklistExecution',
      entityId: executionId,
      newValue: toJsonSafe({ completedAt, hasCriticalNonConformity: hasCriticalNonConformity(updated.answers) }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toChecklistExecutionEntity(updated);
  }

  async findOneForDriver(tenantId: string, driverId: string, id: string): Promise<ChecklistExecutionEntity> {
    const execution = await this.findOwnedOrThrow(tenantId, driverId, id);
    return toChecklistExecutionEntity(execution);
  }

  async findAll(tenantId: string, query: FindChecklistExecutionsQueryDto): Promise<PaginatedChecklistExecutionsEntity> {
    const where: Prisma.ChecklistExecutionWhereInput = {
      tenantId,
      ...(query.tripId ? { tripId: query.tripId } : {}),
      ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.checklistExecution.findMany({
        where,
        include: EXECUTION_INCLUDE,
        orderBy: { startedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.checklistExecution.count({ where }),
    ]);

    const result = new PaginatedChecklistExecutionsEntity();
    result.items = items.map(toChecklistExecutionEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<ChecklistExecutionEntity> {
    const execution = await this.prisma.checklistExecution.findFirst({ where: { id, tenantId }, include: EXECUTION_INCLUDE });
    if (!execution) {
      throw new NotFoundException('Checklist nao encontrado nesta empresa.');
    }
    return toChecklistExecutionEntity(execution);
  }

  private async findOwnedOrThrow(tenantId: string, driverId: string, id: string): Promise<ChecklistExecutionWithRelations> {
    const execution = await this.prisma.checklistExecution.findFirst({
      where: { id, tenantId, driverId },
      include: EXECUTION_INCLUDE,
    });
    if (!execution) {
      throw new NotFoundException('Checklist nao encontrado para este motorista.');
    }
    return execution;
  }
}
