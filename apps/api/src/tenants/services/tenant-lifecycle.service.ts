import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Fase 49 -- transicao automatica TRIAL -> EXPIRED. So Logger (mesmo
// padrao de TollDataSyncScheduler/TollDataSyncService, unico scheduler
// pre-existente do projeto) -- nunca AuditService por tenant aqui (evitaria
// N inserts de auditoria por execucao para uma acao do proprio sistema,
// nao de um ator humano).
@Injectable()
export class TenantLifecycleService {
  private readonly logger = new Logger(TenantLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Idempotente por construcao: a segunda execucao encontra 0 tenants
  // elegiveis (ja viraram EXPIRED na primeira) e nao altera nada. Sempre 2
  // queries no total, nunca 1 por tenant -- findMany so seleciona `id`
  // (nao carrega o registro inteiro) seguido de 1 updateMany em lote.
  async expireOverdueTrials(now: Date = new Date()): Promise<number> {
    const overdue = await this.prisma.tenant.findMany({
      where: { status: 'TRIAL', plan: { trialEndsAt: { lt: now } } },
      select: { id: true },
    });

    if (overdue.length === 0) {
      return 0;
    }

    const ids = overdue.map((t) => t.id);
    await this.prisma.tenant.updateMany({
      where: { id: { in: ids } },
      data: { status: 'EXPIRED', isActive: false },
    });

    this.logger.log(`Trial expirado automaticamente para ${ids.length} tenant(s): ${ids.join(', ')}`);
    return ids.length;
  }
}
