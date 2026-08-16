import { promises as fs } from 'fs';
import { extname } from 'path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ImportFileType,
  ImportJobStatus,
  ImportRowIssueType,
  Prisma,
  TollTransactionSource,
  VehicleTag,
} from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { assertValidFileSignature, ValidatedFileKind } from '../../common/utils/file-signature.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PLAN_ERRORS } from '../../tenants/constants/plan-error.constants';
import {
  assertStorageUnderLimit,
  getStorageUsedBytes,
  runSerializable,
} from '../../tenants/utils/plan-limit.util';
import {
  classifyTollTransaction,
  computeDiscrepancy,
  computeExpectedAmount,
} from '../../tolls/utils/toll-calculation.util';
import { EXTENSION_TO_IMPORT_FILE_TYPE } from '../constants/toll-import-file.constants';
import { FindImportJobErrorsQueryDto } from '../dto/find-import-job-errors-query.dto';
import { FindImportJobsQueryDto } from '../dto/find-import-jobs-query.dto';
import { UploadTollImportDto } from '../dto/upload-toll-import.dto';
import { PaginatedImportJobErrorsEntity } from '../entities/paginated-import-job-errors.entity';
import { PaginatedImportJobsEntity } from '../entities/paginated-import-jobs.entity';
import { ImportJobEntity } from '../entities/import-job.entity';
import { toImportJobErrorEntity } from '../mappers/import-job-error.mapper';
import { ImportJobWithProvider, toImportJobEntity } from '../mappers/import-job.mapper';
import { getTollImportParser } from '../parsers/toll-import-parser.factory';
import { RawImportRow } from '../interfaces/toll-import-parser.interface';
import { mapRowToCanonicalFields } from '../utils/toll-import-header.util';

const JOB_INCLUDE = { provider: true } satisfies Prisma.ImportJobInclude;

type RowOutcome = 'imported' | 'duplicate' | 'error';

@Injectable()
export class TollImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(
    tenantId: string,
    query: FindImportJobsQueryDto,
  ): Promise<PaginatedImportJobsEntity> {
    const where: Prisma.ImportJobWhereInput = {
      tenantId,
      ...(query.providerId ? { providerId: query.providerId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.importJob.findMany({
        where,
        include: JOB_INCLUDE,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.importJob.count({ where }),
    ]);

    const result = new PaginatedImportJobsEntity();
    result.items = items.map(toImportJobEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  async findOne(tenantId: string, id: string): Promise<ImportJobEntity> {
    return toImportJobEntity(await this.findOwnedOrThrow(tenantId, id));
  }

  async findErrors(
    tenantId: string,
    id: string,
    query: FindImportJobErrorsQueryDto,
  ): Promise<PaginatedImportJobErrorsEntity> {
    await this.findOwnedOrThrow(tenantId, id);

    const where: Prisma.ImportJobErrorWhereInput = {
      tenantId,
      importJobId: id,
      ...(query.issueType ? { issueType: query.issueType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.importJobError.findMany({
        where,
        orderBy: { rowNumber: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.importJobError.count({ where }),
    ]);

    const result = new PaginatedImportJobErrorsEntity();
    result.items = items.map(toImportJobErrorEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // Upload sincrono: recebe o arquivo ja salvo em disco (privado, ver
  // toll-import/config/toll-import-storage.config.ts), cria o ImportJob e
  // processa cada linha imediatamente. Nao ha fila/worker assincrono nesta
  // fase (nenhuma infraestrutura de fila esta presente no projeto ainda) --
  // ver pendencia no relatorio final.
  async create(
    tenantId: string,
    dto: UploadTollImportDto,
    file: Express.Multer.File,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ImportJobEntity> {
    let fileType: ImportFileType;
    try {
      fileType = this.resolveFileType(file.originalname);
      // Fase 46 -- extensao/nome do arquivo nunca provam o conteudo real
      // (um executavel renomeado para ".csv"/".xlsx" passaria na checagem
      // acima). So CSV/XLSX chegam aqui (unicas extensoes aceitas por este
      // endpoint), ambas com ValidatedFileKind de mesmo nome literal.
      await assertValidFileSignature(file.path, fileType as ValidatedFileKind);
    } catch (error) {
      await this.safeUnlink(file.path);
      throw error;
    }

    const provider = await this.prisma.tagProvider.findUnique({ where: { id: dto.providerId } });
    if (!provider) {
      await this.safeUnlink(file.path);
      throw new NotFoundException('Operadora (providerId) nao encontrada.');
    }

    // Fase 48 -- limite de armazenamento do plano: checagem + create do
    // ImportJob numa unica transacao Serializable, mesmo mecanismo dos
    // outros limites. Se estourar, o arquivo ja gravado pelo multer e
    // apagado (nunca fica persistido/referenciado por um ImportJob).
    const job = await runSerializable(this.prisma, async (tx) => {
      const plan = await tx.tenantPlan.findUnique({ where: { tenantId } });
      const usedBytes = await getStorageUsedBytes(tx, tenantId);
      assertStorageUnderLimit(usedBytes, file.size, plan?.maxStorageMb, PLAN_ERRORS.STORAGE_LIMIT_REACHED);

      return tx.importJob.create({
        data: {
          tenantId,
          providerId: dto.providerId,
          filename: file.filename,
          originalFilename: file.originalname,
          fileType,
          status: ImportJobStatus.PENDING,
          createdBy: actor.userId,
          sizeBytes: file.size,
        },
        include: JOB_INCLUDE,
      });
    }).catch(async (error: unknown) => {
      await this.safeUnlink(file.path);
      throw error;
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'toll_import.started',
      entityName: 'ImportJob',
      entityId: job.id,
      newValue: toJsonSafe({
        providerId: job.providerId,
        originalFilename: job.originalFilename,
        fileType: job.fileType,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    const processed = await this.processJob(job, tenantId, file.path, actor, metadata);
    return toImportJobEntity(processed);
  }

  private async processJob(
    job: ImportJobWithProvider,
    tenantId: string,
    filePath: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ImportJobWithProvider> {
    const startedAt = new Date();
    await this.prisma.importJob.update({
      where: { id: job.id },
      data: { status: ImportJobStatus.PROCESSING, startedAt },
    });

    let rows: RawImportRow[];
    try {
      const buffer = await fs.readFile(filePath);
      const parser = getTollImportParser(job.fileType);
      rows = await parser.parse(buffer);
    } catch (error) {
      return this.finalizeWithFatalError(job, tenantId, startedAt, error, actor, metadata);
    }

    let imported = 0;
    let ignored = 0;
    let errored = 0;

    if (rows.length === 0) {
      await this.registerRowIssue(
        tenantId,
        job.id,
        0,
        ImportRowIssueType.VALIDATION_ERROR,
        'Nenhuma linha de dados encontrada no arquivo (apenas cabecalho ou arquivo vazio).',
        {},
      );
      errored++;
    }

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2; // +1 para 1-based, +1 para pular o cabecalho
      const outcome = await this.processRow(tenantId, job, row, rowNumber, actor, metadata);
      if (outcome === 'imported') imported++;
      else if (outcome === 'duplicate') ignored++;
      else errored++;
    }

    const finishedAt = new Date();
    const status = this.computeFinalStatus(imported, ignored, errored, rows.length);

    const updated = await this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status,
        importedRecords: imported,
        ignoredRecords: ignored,
        errorRecords: errored,
        finishedAt,
      },
      include: JOB_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: status === ImportJobStatus.FAILED ? 'toll_import.failed' : 'toll_import.completed',
      entityName: 'ImportJob',
      entityId: job.id,
      newValue: toJsonSafe({
        status,
        importedRecords: imported,
        ignoredRecords: ignored,
        errorRecords: errored,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return updated;
  }

  // Nunca interrompe a importacao inteira: qualquer falha (esperada ou nao)
  // nesta linha vira um ImportJobError e o loop continua para a proxima.
  private async processRow(
    tenantId: string,
    job: ImportJobWithProvider,
    raw: RawImportRow,
    rowNumber: number,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<RowOutcome> {
    try {
      const canonical = mapRowToCanonicalFields(raw);
      const missingFields = (['tag', 'praca', 'dataHora', 'valor', 'eixos'] as const).filter(
        (field) => !canonical[field]?.trim(),
      );
      if (missingFields.length > 0) {
        await this.registerRowIssue(
          tenantId,
          job.id,
          rowNumber,
          ImportRowIssueType.VALIDATION_ERROR,
          `Coluna(s) obrigatoria(s) ausente(s) ou vazia(s): ${missingFields.join(', ')}.`,
          raw,
        );
        return 'error';
      }

      const axleCount = Number.parseInt(canonical.eixos!.trim(), 10);
      if (!Number.isInteger(axleCount) || axleCount < 1) {
        await this.registerRowIssue(
          tenantId,
          job.id,
          rowNumber,
          ImportRowIssueType.VALIDATION_ERROR,
          'Quantidade de eixos invalida (deve ser um inteiro maior ou igual a 1).',
          raw,
        );
        return 'error';
      }

      const chargedAmount = this.parseAmount(canonical.valor!);
      if (chargedAmount === null || chargedAmount < 0) {
        await this.registerRowIssue(
          tenantId,
          job.id,
          rowNumber,
          ImportRowIssueType.VALIDATION_ERROR,
          'Valor invalido ou negativo.',
          raw,
        );
        return 'error';
      }

      const chargedAt = this.parseDate(canonical.dataHora!);
      if (!chargedAt) {
        await this.registerRowIssue(
          tenantId,
          job.id,
          rowNumber,
          ImportRowIssueType.VALIDATION_ERROR,
          'Data/hora invalida (use ISO 8601 ou dd/mm/aaaa HH:mm).',
          raw,
        );
        return 'error';
      }

      const tagNumber = canonical.tag!.trim();
      const vehicleTag = await this.prisma.vehicleTag.findFirst({
        where: { tenantId, tagProviderId: job.providerId, tagNumber },
      });
      if (!vehicleTag) {
        await this.registerRowIssue(
          tenantId,
          job.id,
          rowNumber,
          ImportRowIssueType.VALIDATION_ERROR,
          `Tag "${tagNumber}" inexistente para a operadora "${job.provider.name}" (ou veiculo sem tag cadastrada).`,
          raw,
        );
        return 'error';
      }

      const tagValidityError = this.validateTagAt(vehicleTag, chargedAt);
      if (tagValidityError) {
        await this.registerRowIssue(
          tenantId,
          job.id,
          rowNumber,
          ImportRowIssueType.VALIDATION_ERROR,
          tagValidityError,
          raw,
        );
        return 'error';
      }

      const plazaName = canonical.praca!.trim();
      const plaza = await this.prisma.tollPlaza.findFirst({
        where: { name: { equals: plazaName, mode: Prisma.QueryMode.insensitive } },
      });
      if (!plaza) {
        await this.registerRowIssue(
          tenantId,
          job.id,
          rowNumber,
          ImportRowIssueType.VALIDATION_ERROR,
          `Praca de pedagio inexistente: "${plazaName}".`,
          raw,
        );
        return 'error';
      }

      // Extrato nao informa a viagem -- resolvemos pela janela de tempo real
      // da viagem (actualDeparture/actualArrival), nao pelo status atual:
      // uma importacao pode acontecer depois que a viagem ja foi concluida.
      const trip = await this.prisma.trip.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          composition: { vehicleId: vehicleTag.vehicleId },
          actualDeparture: { not: null, lte: chargedAt },
          OR: [{ actualArrival: null }, { actualArrival: { gte: chargedAt } }],
        },
        orderBy: { actualDeparture: 'desc' },
      });
      if (!trip) {
        await this.registerRowIssue(
          tenantId,
          job.id,
          rowNumber,
          ImportRowIssueType.VALIDATION_ERROR,
          'Nenhuma viagem em andamento encontrada para o veiculo na data/hora informada.',
          raw,
        );
        return 'error';
      }

      // Deduplicacao: operadora + tag (via veiculo, ja que uma tag valida
      // pertence a exatamente um veiculo por vez) + praca + data/hora + valor.
      const duplicate = await this.prisma.tollTransaction.findFirst({
        where: {
          tenantId,
          tollPlazaId: plaza.id,
          tagProviderId: job.providerId,
          vehicleId: vehicleTag.vehicleId,
          chargedAt,
          chargedAmount,
        },
      });
      if (duplicate) {
        await this.registerRowIssue(
          tenantId,
          job.id,
          rowNumber,
          ImportRowIssueType.DUPLICATE,
          'Transacao duplicada (mesma operadora, tag/veiculo, praca, data/hora e valor ja importados).',
          raw,
        );
        return 'duplicate';
      }

      const expectedAmount = computeExpectedAmount(plaza.pricePerAxle, axleCount);
      const discrepancyAmount = computeDiscrepancy(chargedAmount, expectedAmount);
      const status = classifyTollTransaction(chargedAmount, discrepancyAmount);

      const transaction = await this.prisma.tollTransaction.create({
        data: {
          tenantId,
          tripId: trip.id,
          vehicleId: vehicleTag.vehicleId,
          driverId: trip.driverId,
          tollPlazaId: plaza.id,
          tagProviderId: job.providerId,
          axleCount,
          expectedAmount,
          chargedAmount,
          discrepancyAmount,
          status,
          chargedAt,
          source: TollTransactionSource.INTEGRATION,
        },
      });

      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'toll_transaction.imported',
        entityName: 'TollTransaction',
        entityId: transaction.id,
        newValue: toJsonSafe({
          importJobId: job.id,
          rowNumber,
          tripId: transaction.tripId,
          tollPlazaId: transaction.tollPlazaId,
          chargedAmount: transaction.chargedAmount,
          status: transaction.status,
        }),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });

      return 'imported';
    } catch (error) {
      await this.registerRowIssue(
        tenantId,
        job.id,
        rowNumber,
        ImportRowIssueType.VALIDATION_ERROR,
        `Erro inesperado ao processar linha: ${error instanceof Error ? error.message : 'erro desconhecido'}.`,
        raw,
      );
      return 'error';
    }
  }

  private async finalizeWithFatalError(
    job: ImportJobWithProvider,
    tenantId: string,
    startedAt: Date,
    error: unknown,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ImportJobWithProvider> {
    const finishedAt = new Date();
    await this.registerRowIssue(
      tenantId,
      job.id,
      0,
      ImportRowIssueType.VALIDATION_ERROR,
      `Falha ao ler o arquivo: ${error instanceof Error ? error.message : 'formato invalido ou corrompido'}.`,
      {},
    );

    const updated = await this.prisma.importJob.update({
      where: { id: job.id },
      data: { status: ImportJobStatus.FAILED, errorRecords: 1, finishedAt },
      include: JOB_INCLUDE,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'toll_import.failed',
      entityName: 'ImportJob',
      entityId: job.id,
      newValue: toJsonSafe({
        status: ImportJobStatus.FAILED,
        reason: 'parse_error',
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return updated;
  }

  // Duplicidade NUNCA e tratada como falha (e o mecanismo de deduplicacao
  // funcionando como esperado) -- so contam como falha as linhas com erro
  // de validacao de fato.
  private computeFinalStatus(
    imported: number,
    ignored: number,
    errored: number,
    total: number,
  ): ImportJobStatus {
    if (total === 0) return ImportJobStatus.FAILED;
    if (errored > 0 && imported === 0) return ImportJobStatus.FAILED;
    if (errored > 0) return ImportJobStatus.PARTIAL_SUCCESS;
    return ImportJobStatus.COMPLETED;
  }

  // Distinto do assertVehicleHasValidTag do TollTransactionsService (que
  // valida contra o momento ATUAL, para registro manual em tempo real) --
  // aqui a importacao registra fatos historicos, entao a validade da tag e
  // avaliada no instante da cobranca (chargedAt), nao em "agora".
  private validateTagAt(tag: VehicleTag, at: Date): string | null {
    if (!tag.isActive) return 'Tag inativa.';
    if (tag.expiresAt && tag.expiresAt <= at) return 'Tag vencida na data/hora da cobranca.';
    return null;
  }

  private parseAmount(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // Aceita formato BR (1.234,56) ou US (1234.56).
    const normalized = trimmed.includes(',')
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed;
    const value = Number.parseFloat(normalized);
    if (Number.isNaN(value)) return null;
    return Math.round(value * 100) / 100;
  }

  private parseDate(raw: string): Date | null {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const iso = new Date(trimmed);
      if (!Number.isNaN(iso.getTime())) return iso;
    }

    const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (brMatch) {
      const [, dd, mm, yyyy, hh, min, ss] = brMatch;
      const date = new Date(
        Number(yyyy),
        Number(mm) - 1,
        Number(dd),
        Number(hh),
        Number(min),
        ss ? Number(ss) : 0,
      );
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  private resolveFileType(originalFilename: string): ImportFileType {
    const ext = extname(originalFilename).toLowerCase();
    const fileType = EXTENSION_TO_IMPORT_FILE_TYPE[ext];
    if (!fileType) {
      throw new BadRequestException(
        `Extensao de arquivo nao suportada: "${ext}". Extensoes aceitas: .csv, .xlsx.`,
      );
    }
    return fileType;
  }

  private async registerRowIssue(
    tenantId: string,
    importJobId: string,
    rowNumber: number,
    issueType: ImportRowIssueType,
    message: string,
    rawData: unknown,
  ): Promise<void> {
    await this.prisma.importJobError.create({
      data: {
        tenantId,
        importJobId,
        rowNumber,
        issueType,
        message,
        rawData: rawData as Prisma.InputJsonValue,
      },
    });
  }

  private async safeUnlink(path: string): Promise<void> {
    try {
      await fs.unlink(path);
    } catch {
      // Melhor esforco -- se o arquivo ja nao existe ou nao pode ser
      // removido, nao deve derrubar a operacao (que ja falhou por outro
      // motivo, ex: operadora inexistente).
    }
  }

  private async findOwnedOrThrow(tenantId: string, id: string): Promise<ImportJobWithProvider> {
    const job = await this.prisma.importJob.findFirst({
      where: { id, tenantId },
      include: JOB_INCLUDE,
    });
    if (!job) {
      throw new NotFoundException('Job de importacao nao encontrado nesta empresa.');
    }
    return job;
  }
}
