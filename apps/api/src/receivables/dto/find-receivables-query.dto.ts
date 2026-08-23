import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { EFFECTIVE_RECEIVABLE_STATUS_VALUES, EffectiveReceivableStatus } from '../utils/receivable-status.util';

// GET /receivables -- mesmo espirito de FindTripBillingsQueryDto (Fase 60):
// DTO proprio do modulo, nunca importa literalmente o DTO de outro
// dominio. status aceita OVERDUE alem dos 4 valores persistidos (ver
// receivable-status.util.ts).
export class FindReceivablesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca por descricao/cliente.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  tripId?: string;

  @ApiPropertyOptional({ enum: EFFECTIVE_RECEIVABLE_STATUS_VALUES })
  @IsOptional()
  @IsIn(EFFECTIVE_RECEIVABLE_STATUS_VALUES)
  status?: EffectiveReceivableStatus;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'Filtra por issueDate >= from.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Filtra por issueDate <= to.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filtra por dueDate >= dueFrom.' })
  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @ApiPropertyOptional({ description: 'Filtra por dueDate <= dueTo.' })
  @IsOptional()
  @IsDateString()
  dueTo?: string;
}
