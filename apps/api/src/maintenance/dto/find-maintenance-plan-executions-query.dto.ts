import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Fase 81 -- historico de execucoes de um plano preventivo. So paginacao;
// o vinculo com o plano vem do :id da rota.
export class FindMaintenancePlanExecutionsQueryDto extends PaginationQueryDto {}
