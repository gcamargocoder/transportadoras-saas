import { Injectable, Logger } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { compact } from '../../common/utils/compact.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogEntry } from '../interfaces/audit-log-entry.interface';

// Ponto unico de escrita em AuditLog. Servicos de negocio (TenantsService,
// UsersService, e futuros modulos) chamam log() apos qualquer mutacao --
// nunca escrevem em prisma.auditLog diretamente, para manter o formato
// consistente e centralizar eventuais falhas de auditoria.
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          userId: entry.userId,
          action: entry.action,
          entityName: entry.entityName,
          entityId: entry.entityId,
          ...compact({
            // Prisma exige o sentinel Prisma.JsonNull para gravar `null` em
            // coluna Json (um `null` JS puro seria ambiguo com "omitir").
            previousValue: this.toJsonInput(entry.previousValue),
            newValue: this.toJsonInput(entry.newValue),
            ipAddress: entry.ipAddress,
            deviceInfo: entry.userAgent,
          }),
        },
      });
    } catch (error) {
      // Auditoria nunca pode derrubar a operacao de negocio que a originou --
      // registra o erro e segue.
      this.logger.error(
        `Falha ao registrar auditoria (${entry.action} em ${entry.entityName}:${entry.entityId})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  // Leitura do historico de auditoria de uma entidade especifica (ex:
  // "GET /vehicles/:id/history"). Reutilizavel por qualquer modulo que
  // queira expor esse mesmo tipo de rota no futuro -- nao fica preso ao
  // modulo de frota. Implementado por cima de search() (Fase 77) -- nenhuma
  // duplicacao de query.
  async findByEntity(
    tenantId: string,
    entityName: string,
    entityId: string,
    pagination: { page: number; pageSize: number },
  ): Promise<{ items: AuditLog[]; total: number }> {
    return this.search(tenantId, { entityNames: [entityName], entityId }, pagination);
  }

  // Leitura genErica, com filtros opcionais -- unico ponto de consulta
  // paginada em AuditLog (Fase 77, ex: GET /finance/audit). tenantId e
  // SEMPRE obrigatorio e sempre aplicado no where (nunca vaza entre
  // tenants, mesmo que entityId pertenca a outro tenant -- nesse caso a
  // combinacao tenantId+entityId simplesmente nao bate com nenhuma linha).
  // Paginado no banco (skip/take), nunca carrega tudo para filtrar em
  // memoria.
  async search(
    tenantId: string,
    filters: {
      entityNames?: string[];
      entityId?: string;
      action?: string;
      userId?: string;
      from?: Date;
      to?: Date;
    },
    pagination: { page: number; pageSize: number },
  ): Promise<{ items: AuditLog[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(filters.entityNames ? { entityName: { in: filters.entityNames } } : {}),
      ...(filters.entityId ? { entityId: filters.entityId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }

  private toJsonInput(
    value: Record<string, unknown> | null | undefined,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }
}
