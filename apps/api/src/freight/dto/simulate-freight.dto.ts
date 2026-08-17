import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { FreightCalculationInputDto } from './freight-calculation-input.dto';

export class SimulateFreightDto extends FreightCalculationInputDto {
  @ApiProperty({ format: 'uuid', description: 'Cliente para o qual a simulacao busca tabelas/regras vigentes.' })
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Restringe a simulacao a uma tabela especifica. Omitido: busca em todas as tabelas ACTIVE do cliente.',
  })
  @IsOptional()
  @IsUUID('4')
  freightTableId?: string;

  @ApiPropertyOptional({ description: 'Data de referencia para vigencia -- default: agora.' })
  @IsOptional()
  @IsDateString()
  asOf?: string;
}
