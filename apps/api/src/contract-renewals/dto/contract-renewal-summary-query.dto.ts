import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ContractRenewalSummaryQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Restringe os indicadores a um unico cliente (usado pela pagina do cliente).' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;
}
