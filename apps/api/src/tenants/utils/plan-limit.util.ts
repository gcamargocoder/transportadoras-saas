import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Fase 48 -- pura, testada isoladamente. `limit` null/undefined = sem
// limite configurado no plano (nunca bloqueia). `currentCount` deve ser
// contado ANTES do create, dentro da mesma transacao serializavel de
// runSerializable() -- ver uso em UsersService/VehiclesService/DriversService.
export function assertUnderLimit(
  currentCount: number,
  limit: number | null | undefined,
  message: string,
): void {
  if (limit == null) return;
  if (currentCount >= limit) {
    throw new ConflictException(message);
  }
}

// Codigo Prisma/Postgres para falha de serializacao (conflito real de
// concorrencia detectado pelo banco) -- unico caso em que vale tentar de
// novo automaticamente; qualquer outro erro (incluindo ConflictException de
// limite/duplicidade lancado dentro de `fn`) propaga na hora.
const SERIALIZATION_FAILURE_CODE = 'P2034';

// Fase 48 -- roda `fn` dentro de uma transacao Postgres Serializable e
// propaga; um retry automatico caso o proprio Postgres aborte a transacao
// por conflito de serializacao entre duas requisicoes concorrentes (padrao
// recomendado pela Prisma para isolationLevel: Serializable). Reaproveitado
// por todo fluxo de criacao que precisa checar limite do plano de forma
// race-safe (usuarios, veiculos, motoristas, storage).
const BYTES_PER_MB = 1024 * 1024;

// Fase 48 -- soma real de bytes ja armazenados pelo tenant (Attachment +
// ImportJob, unicos dois modelos com upload de arquivo hoje). So soma
// valores nao-nulos de sizeBytes -- uploads anteriores a esta fase (NULL)
// ficam de fora, nunca estimados.
export async function getStorageUsedBytes(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<number> {
  const [attachments, importJobs] = await Promise.all([
    tx.attachment.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } }),
    tx.importJob.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } }),
  ]);
  return (attachments._sum.sizeBytes ?? 0) + (importJobs._sum.sizeBytes ?? 0);
}

// `maxStorageMb` null/undefined = sem limite configurado (nunca bloqueia).
export function assertStorageUnderLimit(
  currentBytes: number,
  incomingBytes: number,
  maxStorageMb: number | null | undefined,
  message: string,
): void {
  if (maxStorageMb == null) return;
  if (currentBytes + incomingBytes > maxStorageMb * BYTES_PER_MB) {
    throw new ConflictException(message);
  }
}

export async function runSerializable<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === SERIALIZATION_FAILURE_CODE) {
      return prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    }
    throw error;
  }
}
