import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ChecklistTemplate, ChecklistTemplateStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateChecklistTemplateDto } from '../dto/create-checklist-template.dto';
import { FindChecklistTemplatesQueryDto } from '../dto/find-checklist-templates-query.dto';
import { UpdateChecklistTemplateDto } from '../dto/update-checklist-template.dto';
import { ChecklistTemplateEntity } from '../entities/checklist-template.entity';
import { PaginatedChecklistTemplatesEntity } from '../entities/paginated-checklist-templates.entity';
import { ChecklistTemplateWithRelations, toChecklistTemplateEntity } from '../mappers/checklist-template.mapper';

const TEMPLATE_INCLUDE = {
  sections: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } },
} satisfies Prisma.ChecklistTemplateInclude;

type TransactionClient = Prisma.TransactionClient;

// Fase 38 -- fundacao do modulo de checklist operacional. Template ->
// Section -> Item aninhados (ver justificativa no plano: sem endpoints
// separados para section/item, tudo aninhado no payload do template).
// Versionamento espelha o padrao "fecha o antigo, cria o novo" ja usado em
// TollRatesService.upsertFromAutomatedSource (Fase 35/36), so que aqui a
// transicao PUBLISHED->nova versao e sempre uma acao explicita do admin
// (createNewVersion), nunca automatica.
@Injectable()
export class ChecklistTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    tenantId: string,
    dto: CreateChecklistTemplateDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ChecklistTemplateEntity> {
    const template = await this.prisma.$transaction(async (tx) => {
      const created = await tx.checklistTemplate.create({
        data: {
          tenantId,
          name: dto.name,
          type: dto.type,
          ...compact({ description: dto.description, vehicleType: dto.vehicleType, trailerType: dto.trailerType }),
        },
      });
      await this.createSections(tx, created.id, dto.sections);
      return this.findWithSectionsOrThrow(tx, tenantId, created.id);
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'template.created',
      entityName: 'ChecklistTemplate',
      entityId: template.id,
      newValue: toJsonSafe({ name: template.name, type: template.type, sectionsCount: template.sections.length }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toChecklistTemplateEntity(template);
  }

  // So aceito enquanto DRAFT (ver seção 19 da Fase 38) -- substitui a arvore
  // inteira: apaga sections/items existentes (cascade) e recria a partir do
  // payload. Seguro porque um template DRAFT nunca tem ChecklistExecution
  // associada (create() de execucao exige status PUBLISHED).
  async update(
    tenantId: string,
    id: string,
    dto: UpdateChecklistTemplateDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ChecklistTemplateEntity> {
    const existing = await this.findRowOrThrow(tenantId, id);
    if (existing.status !== ChecklistTemplateStatus.DRAFT) {
      throw new ConflictException(
        'Template PUBLISHED nao pode ser alterado diretamente. Crie uma nova versao (POST /checklists/templates/:id/versions).',
      );
    }

    const template = await this.prisma.$transaction(async (tx) => {
      await tx.checklistSection.deleteMany({ where: { templateId: id } });
      await tx.checklistTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          type: dto.type,
          description: dto.description ?? null,
          vehicleType: dto.vehicleType ?? null,
          trailerType: dto.trailerType ?? null,
        },
      });
      await this.createSections(tx, id, dto.sections);
      return this.findWithSectionsOrThrow(tx, tenantId, id);
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'template.updated',
      entityName: 'ChecklistTemplate',
      entityId: id,
      previousValue: toJsonSafe({ name: existing.name, type: existing.type }),
      newValue: toJsonSafe({ name: template.name, type: template.type, sectionsCount: template.sections.length }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toChecklistTemplateEntity(template);
  }

  async publish(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ChecklistTemplateEntity> {
    const existing = await this.findWithSectionsOrThrow(this.prisma, tenantId, id);
    if (existing.status !== ChecklistTemplateStatus.DRAFT) {
      throw new ConflictException('Somente um template DRAFT pode ser publicado.');
    }
    if (existing.sections.length === 0 || existing.sections.every((section) => section.items.length === 0)) {
      throw new ConflictException('Template vazio nao pode ser publicado (precisa de pelo menos 1 section com 1 item).');
    }

    const publishedAt = new Date();
    const template = await this.prisma.checklistTemplate.update({
      where: { id },
      data: { status: ChecklistTemplateStatus.PUBLISHED, publishedAt },
      include: TEMPLATE_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'template.published',
      entityName: 'ChecklistTemplate',
      entityId: id,
      newValue: toJsonSafe({ publishedAt }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toChecklistTemplateEntity(template);
  }

  // POST /checklists/templates/:id/versions -- adicao deliberada, fora da
  // lista literal de endpoints do pedido da Fase 38, mas exigida pela
  // propria regra de imutabilidade (secao 19): sem esta rota, alterar um
  // template PUBLISHED seria impossivel. Copia sections/items do template
  // origem como ponto de partida editavel; o origem permanece PUBLISHED e
  // intacto (nenhuma execucao existente muda de versao retroativamente).
  async createNewVersion(
    tenantId: string,
    id: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ChecklistTemplateEntity> {
    const source = await this.findWithSectionsOrThrow(this.prisma, tenantId, id);
    if (source.status !== ChecklistTemplateStatus.PUBLISHED) {
      throw new ConflictException('Somente um template PUBLISHED pode gerar uma nova versao.');
    }

    const template = await this.prisma.$transaction(async (tx) => {
      const created = await tx.checklistTemplate.create({
        data: {
          tenantId,
          name: source.name,
          description: source.description,
          type: source.type,
          vehicleType: source.vehicleType,
          trailerType: source.trailerType,
          version: source.version + 1,
          status: ChecklistTemplateStatus.DRAFT,
          previousVersionId: source.id,
        },
      });

      for (const section of source.sections) {
        await tx.checklistSection.create({
          data: {
            templateId: created.id,
            title: section.title,
            description: section.description,
            order: section.order,
            items: {
              create: section.items.map((item) => ({
                code: item.code,
                label: item.label,
                description: item.description,
                type: item.type,
                required: item.required,
                order: item.order,
                requiresObservation: item.requiresObservation,
                requiresPhoto: item.requiresPhoto,
                critical: item.critical,
                options: item.options === null ? Prisma.JsonNull : (item.options as Prisma.InputJsonValue),
              })),
            },
          },
        });
      }

      return this.findWithSectionsOrThrow(tx, tenantId, created.id);
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'template.new_version_created',
      entityName: 'ChecklistTemplate',
      entityId: template.id,
      newValue: toJsonSafe({ previousVersionId: source.id, version: template.version }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toChecklistTemplateEntity(template);
  }

  // GET driver/checklists/available -- so PUBLISHED (nunca DRAFT/ARCHIVED,
  // ver Fase 38 secao 5/17). Lista simples (sem paginacao): sao poucos
  // templates ativos por tenant, mesmo espirito de outras listagens
  // operacionais pequenas do app do motorista (ex: GET /driver/config).
  async findPublishedForDriver(tenantId: string): Promise<ChecklistTemplateEntity[]> {
    const templates = await this.prisma.checklistTemplate.findMany({
      where: { tenantId, status: ChecklistTemplateStatus.PUBLISHED },
      include: TEMPLATE_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return templates.map(toChecklistTemplateEntity);
  }

  async findAll(tenantId: string, query: FindChecklistTemplatesQueryDto): Promise<PaginatedChecklistTemplatesEntity> {
    const where: Prisma.ChecklistTemplateWhereInput = {
      tenantId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.checklistTemplate.findMany({
        where,
        include: TEMPLATE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.checklistTemplate.count({ where }),
    ]);

    const result = new PaginatedChecklistTemplatesEntity();
    result.items = items.map(toChecklistTemplateEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<ChecklistTemplateEntity> {
    const template = await this.findWithSectionsOrThrow(this.prisma, tenantId, id);
    return toChecklistTemplateEntity(template);
  }

  // Usado pelo ChecklistExecutionsService.create -- so precisa saber se o
  // template existe/pertence ao tenant e esta PUBLISHED, sem relations.
  async findRowOrThrow(tenantId: string, id: string): Promise<ChecklistTemplate> {
    const template = await this.prisma.checklistTemplate.findFirst({ where: { id, tenantId } });
    if (!template) {
      throw new NotFoundException('Template de checklist nao encontrado nesta empresa.');
    }
    return template;
  }

  private async findWithSectionsOrThrow(
    client: PrismaService | TransactionClient,
    tenantId: string,
    id: string,
  ): Promise<ChecklistTemplateWithRelations> {
    const template = await client.checklistTemplate.findFirst({ where: { id, tenantId }, include: TEMPLATE_INCLUDE });
    if (!template) {
      throw new NotFoundException('Template de checklist nao encontrado nesta empresa.');
    }
    return template;
  }

  private async createSections(
    tx: TransactionClient,
    templateId: string,
    sections: CreateChecklistTemplateDto['sections'],
  ): Promise<void> {
    for (const section of sections) {
      await tx.checklistSection.create({
        data: {
          templateId,
          title: section.title,
          order: section.order,
          ...compact({ description: section.description }),
          items: {
            create: section.items.map((item) => ({
              code: item.code,
              label: item.label,
              type: item.type,
              order: item.order,
              required: item.required ?? false,
              requiresObservation: item.requiresObservation ?? false,
              requiresPhoto: item.requiresPhoto ?? false,
              critical: item.critical ?? false,
              ...compact({
                description: item.description,
                options: item.options as Prisma.InputJsonValue | undefined,
              }),
            })),
          },
        },
      });
    }
  }
}
