import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Fase 50 -- identifica assinaturas vencidas (secao 6 do pedido). Mesmo
// padrao exato de TenantLifecycleService (Fase 49): 2 queries no total,
// nunca 1 por assinatura; so Logger (nunca AuditService por assinatura
// aqui -- acao do proprio sistema, nao de um SUPER_ADMIN). NUNCA toca em
// Tenant.status/isActive -- suspender o tenant continua 100% manual
// (pedido explicito: "nao suspender automaticamente nesta fase").
@Injectable()
export class BillingLifecycleService {
  private readonly logger = new Logger(BillingLifecycleService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Idempotente por construcao: uma assinatura ja OVERDUE nao e mais
  // elegivel ao filtro `status: {in: [ACTIVE, PENDING]}` na proxima
  // execucao.
  async markOverdueSubscriptions(now: Date = new Date()): Promise<number> {
    const overdue = await this.prisma.tenantSubscription.findMany({
      where: { status: { in: ['ACTIVE', 'PENDING'] }, nextDueDate: { lt: now } },
      select: { id: true },
    });

    if (overdue.length === 0) {
      return 0;
    }

    const ids = overdue.map((s) => s.id);
    await this.prisma.tenantSubscription.updateMany({
      where: { id: { in: ids } },
      data: { status: 'OVERDUE' },
    });

    this.logger.log(`${ids.length} assinatura(s) marcada(s) como OVERDUE: ${ids.join(', ')}`);
    return ids.length;
  }
}
