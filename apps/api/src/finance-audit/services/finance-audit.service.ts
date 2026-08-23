import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/services/audit.service';
import { toAuditLogEntity } from '../../audit/mappers/audit-log.mapper';
import { PaginatedAuditLogEntity } from '../../audit/entities/paginated-audit-log.entity';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { FINANCE_AUDIT_ENTITY_NAMES } from '../constants/finance-audit-entity-names.constants';
import { FindFinanceAuditQueryDto } from '../dto/find-finance-audit-query.dto';

// Fase 77 -- GET /finance/audit. NAO e um sistema de auditoria novo: e uma
// leitura filtrada/paginada em cima do MESMO AuditLog/AuditService ja
// usado por todo o resto da API (AuditService.search(), Fase 77). O unico
// papel deste servico e restringir o escopo a entityName financeiro
// (Receivable/ReceivablePayment/Payable/PayablePayment/FinancialPeriod) --
// nenhuma logica de escrita, nenhuma tabela nova.
@Injectable()
export class FinanceAuditService {
  constructor(private readonly audit: AuditService) {}

  async findAll(tenantId: string, query: FindFinanceAuditQueryDto): Promise<PaginatedAuditLogEntity> {
    const entityNames = query.entityName ? [query.entityName] : [...FINANCE_AUDIT_ENTITY_NAMES];

    const { items, total } = await this.audit.search(
      tenantId,
      {
        entityNames,
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.from ? { from: new Date(query.from) } : {}),
        ...(query.to ? { to: new Date(query.to) } : {}),
      },
      { page: query.page, pageSize: query.pageSize },
    );

    const result = new PaginatedAuditLogEntity();
    result.items = items.map(toAuditLogEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }
}
