import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { FreightCalculationInputDto } from './freight-calculation-input.dto';

export class ApplyFreightToTripDto extends FreightCalculationInputDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Cliente usado para buscar tabelas/regras. Omitido: usa o Trip.customerId da propria viagem.',
  })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Contrato comercial usado nesta viagem (opcional). Precisa estar ACTIVE e nao vencido.',
  })
  @IsOptional()
  @IsUUID('4')
  contractId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Restringe a uma tabela especifica.' })
  @IsOptional()
  @IsUUID('4')
  freightTableId?: string;
}
