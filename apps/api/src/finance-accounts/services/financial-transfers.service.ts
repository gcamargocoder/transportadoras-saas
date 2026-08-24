import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialTransactionType, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { FinancialPeriodGuardService } from '../../financial-periods/services/financial-period-guard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFinancialTransferDto } from '../dto/create-financial-transfer.dto';
import { FinancialTransferResultEntity } from '../entities/financial-transfer-result.entity';
import { FinancialTransactionWithRelations, toFinancialTransactionEntity } from '../mappers/financial-transaction.mapper';

const INCLUDE = { creator: true } satisfies Prisma.FinancialTransactionInclude;

// referenceType usado para marcar as duas pontas de uma transferencia --
// unico vinculo entre elas (secao 4 do pedido: "utilizar duas
// FinancialTransactions vinculadas por um identificador comum" em vez de
// criar uma tabela FinancialTransfer dedicada).
const TRANSFER_REFERENCE_TYPE = 'FinancialTransfer';

// Fase 78, secao 4/9 -- transferencia NUNCA e receita/despesa: sempre duas
// FinancialTransaction (DEBIT na origem, CREDIT no destino) criadas dentro
// da MESMA transacao Prisma. Se qualquer uma falhar, nenhuma das duas fica
// gravada (rollback completo).
@Injectable()
export class FinancialTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly periodGuard: FinancialPeriodGuardService,
  ) {}

  async create(
    tenantId: string,
    dto: CreateFinancialTransferDto,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<FinancialTransferResultEntity> {
    if (dto.sourceAccountId === dto.destinationAccountId) {
      throw new BadRequestException('A conta de origem e a conta de destino nao podem ser a mesma.');
    }

    const [source, destination] = await Promise.all([
      this.prisma.financialAccount.findFirst({ where: { id: dto.sourceAccountId, tenantId } }),
      this.prisma.financialAccount.findFirst({ where: { id: dto.destinationAccountId, tenantId } }),
    ]);
    if (!source || !destination) {
      throw new NotFoundException('Conta de origem e/ou destino nao encontrada nesta empresa.');
    }
    if (!source.isActive || !destination.isActive) {
      throw new ConflictException('A conta de origem e a conta de destino precisam estar ativas.');
    }

    const transactionDate = new Date(dto.transactionDate);
    await this.periodGuard.assertPeriodOpenForDate(tenantId, transactionDate);

    const transferId = randomUUID();
    const description = dto.description?.trim() || `Transferencia de ${source.name} para ${destination.name}`;

    const { debit, credit } = await this.prisma.$transaction(async (tx) => {
      const debit = await tx.financialTransaction.create({
        data: {
          tenantId,
          accountId: source.id,
          type: FinancialTransactionType.DEBIT,
          amount: dto.amount,
          transactionDate,
          description,
          referenceType: TRANSFER_REFERENCE_TYPE,
          referenceId: transferId,
          createdBy: actor.userId,
        },
        include: INCLUDE,
      });
      const credit = await tx.financialTransaction.create({
        data: {
          tenantId,
          accountId: destination.id,
          type: FinancialTransactionType.CREDIT,
          amount: dto.amount,
          transactionDate,
          description,
          referenceType: TRANSFER_REFERENCE_TYPE,
          referenceId: transferId,
          createdBy: actor.userId,
        },
        include: INCLUDE,
      });
      return { debit, credit };
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'financial_transfer.created',
      entityName: TRANSFER_REFERENCE_TYPE,
      entityId: transferId,
      newValue: toJsonSafe({
        sourceAccountId: source.id,
        destinationAccountId: destination.id,
        amount: dto.amount,
        transactionDate,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    const result = new FinancialTransferResultEntity();
    result.transferId = transferId;
    result.debit = toFinancialTransactionEntity(debit as unknown as FinancialTransactionWithRelations);
    result.credit = toFinancialTransactionEntity(credit as unknown as FinancialTransactionWithRelations);
    return result;
  }
}
