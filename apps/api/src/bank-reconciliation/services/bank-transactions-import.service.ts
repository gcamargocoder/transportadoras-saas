import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { compact } from '../../common/utils/compact.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ImportBankTransactionsResultEntity } from '../entities/import-bank-transactions-result.entity';
import {
  computeRowHash,
  mapRowToCanonicalFields,
  parseBankTransactionDate,
  parseBankTransactionType,
  parseMonetaryAmount,
} from '../utils/bank-transaction-csv.util';

const TEXT_SNIFF_BYTES = 8192;
type RowOutcome = 'imported' | 'duplicate' | 'invalid';

// Fase 80, secao 1/13 -- import SINCRONO, processado direto do buffer em
// memoria (multer memoryStorage no controller -- nunca gravado em disco,
// nunca um ImportJob/fila como o toll-import, Fase 46: aqui nao ha
// necessidade de reprocessamento assincrono nem de manter o arquivo
// original). O resumo (rowsRead/imported/duplicates/invalid) volta direto
// na resposta HTTP.
@Injectable()
export class BankTransactionsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async import(
    tenantId: string,
    financialAccountId: string,
    file: Express.Multer.File,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ImportBankTransactionsResultEntity> {
    const account = await this.prisma.financialAccount.findFirst({ where: { id: financialAccountId, tenantId } });
    if (!account) {
      throw new NotFoundException('Conta financeira nao encontrada nesta empresa.');
    }

    // Mesmo criterio de common/utils/file-signature.util.ts para CSV (byte
    // NUL nos primeiros 8KB indica conteudo binario disfarçado) -- adaptado
    // para buffer em memoria, ja que este import nunca grava em disco.
    if (file.buffer.subarray(0, TEXT_SNIFF_BYTES).includes(0)) {
      throw new BadRequestException('Arquivo invalido: conteudo binario detectado onde um CSV de texto era esperado.');
    }

    let rows: Record<string, string>[];
    try {
      rows = parse(file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        delimiter: [',', ';'],
      }) as Record<string, string>[];
    } catch (error) {
      throw new BadRequestException(
        `Falha ao ler o arquivo CSV: ${error instanceof Error ? error.message : 'formato invalido'}.`,
      );
    }

    const result = new ImportBankTransactionsResultEntity();
    result.rowsRead = rows.length;
    result.imported = 0;
    result.duplicates = 0;
    result.invalid = 0;
    result.errors = [];

    for (const [index, raw] of rows.entries()) {
      const rowNumber = index + 2; // +1 para 1-based, +1 para pular o cabecalho
      const outcome = await this.processRow(tenantId, financialAccountId, raw, rowNumber, actor, metadata, result.errors);
      if (outcome === 'imported') result.imported++;
      else if (outcome === 'duplicate') result.duplicates++;
      else result.invalid++;
    }

    return result;
  }

  // Nunca interrompe a importacao inteira -- qualquer falha nesta linha
  // (esperada ou nao) vira uma entrada em `errors` e o loop continua.
  private async processRow(
    tenantId: string,
    financialAccountId: string,
    raw: Record<string, string>,
    rowNumber: number,
    actor: AuditActor,
    metadata: RequestMetadata,
    errors: { row: number; message: string }[],
  ): Promise<RowOutcome> {
    try {
      const canonical = mapRowToCanonicalFields(raw);
      const missing = (['date', 'description', 'amount', 'type'] as const).filter((field) => !canonical[field]?.trim());
      if (missing.length > 0) {
        errors.push({ row: rowNumber, message: `Coluna(s) obrigatoria(s) ausente(s) ou vazia(s): ${missing.join(', ')}.` });
        return 'invalid';
      }

      const date = parseBankTransactionDate(canonical.date!);
      if (!date) {
        errors.push({ row: rowNumber, message: 'Data invalida (use ISO 8601 ou dd/mm/aaaa).' });
        return 'invalid';
      }

      const amount = parseMonetaryAmount(canonical.amount!);
      if (amount === null || Number(amount) <= 0) {
        errors.push({ row: rowNumber, message: 'Valor invalido (deve ser numerico e maior que zero).' });
        return 'invalid';
      }

      const type = parseBankTransactionType(canonical.type!);
      if (!type) {
        errors.push({ row: rowNumber, message: `Tipo invalido: "${canonical.type}" (use CREDIT ou DEBIT).` });
        return 'invalid';
      }

      const description = canonical.description!.trim();
      const externalId = canonical.externalId?.trim() || null;
      const rowHash = computeRowHash(date, description, amount, type);

      // Secao 1 -- duplicidade por externalId quando disponivel; caso
      // contrario, rowHash como sinal DEFENSIVO (nunca garantia absoluta --
      // ver docs/bank-reconciliation.md).
      const duplicate = await this.prisma.financialBankTransaction.findFirst({
        where: externalId
          ? { tenantId, financialAccountId, externalId }
          : { tenantId, financialAccountId, externalId: null, rowHash },
      });
      if (duplicate) {
        return 'duplicate';
      }

      const created = await this.prisma.financialBankTransaction.create({
        data: {
          tenantId,
          financialAccountId,
          date,
          description,
          amount,
          type,
          rowHash,
          metadata: raw as Prisma.InputJsonValue,
          ...compact({ externalId: externalId ?? undefined }),
        },
      });

      await this.audit.log({
        tenantId,
        userId: actor.userId,
        action: 'financial_bank_transaction.imported',
        entityName: 'FinancialBankTransaction',
        entityId: created.id,
        newValue: toJsonSafe({
          financialAccountId,
          bankTransactionId: created.id,
          amount,
          date,
          externalId,
        }),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });

      return 'imported';
    } catch (error) {
      errors.push({
        row: rowNumber,
        message: `Erro inesperado ao processar linha: ${error instanceof Error ? error.message : 'erro desconhecido'}.`,
      });
      return 'invalid';
    }
  }
}
