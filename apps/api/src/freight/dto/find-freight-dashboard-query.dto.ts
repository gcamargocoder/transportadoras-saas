import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

// Mesmo espirito de FleetOperationsQueryDto (fleet-operations/dto) --
// periodo + cliente -- sem importar o DTO de outro dominio (Fretes tem seu
// proprio bounded context, mesmo padrao de FindFiscalDocumentsQueryDto que
// nao reaproveita literalmente o DTO de outro modulo).
export class FindFreightDashboardQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01', description: 'Filtra por TripFreight.createdAt >= startDate.' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Filtra por TripFreight.createdAt <= endDate.' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;
}
