import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// Fase 98 -- inicia o processo de renovacao de um Contract JA EXISTENTE
// (regra 1/2: nunca um segundo cadastro de contrato). Nenhum dado do
// contrato novo e pedido aqui -- isso so acontece em
// CompleteContractRenewalDto, no momento de CONCLUIR (regra 4: nenhuma
// alteracao automatica sem acao explicita).
export class CreateContractRenewalDto {
  @ApiProperty({ format: 'uuid', description: 'Contrato a renovar (precisa estar ACTIVE ou EXPIRED).' })
  @IsUUID('4', { message: 'contractId deve ser um UUID valido.' })
  contractId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
