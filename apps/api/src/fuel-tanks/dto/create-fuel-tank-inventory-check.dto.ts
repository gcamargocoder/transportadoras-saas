import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

// theoreticalStockLiters NAO faz parte deste DTO de proposito -- e SEMPRE
// lido de FuelTank.currentStockLiters no service, dentro da mesma transacao
// (secao 2 do pedido: "nao aceitar o estoque teorico enviado pelo
// frontend"). applyAdjustment e uma decisao EXPLICITA e obrigatoria (secao 9:
// "nao alterar estoque apenas porque o usuario enviou uma medicao") -- nunca
// um default implicito a partir da divergencia calculada.
//
// notes NAO e validado como obrigatorio aqui (via @ValidateIf) de proposito:
// a divergencia so e conhecida no service (theoreticalStockLiters vem do
// servidor). "Motivo obrigatorio" (secao 7: nenhum ajuste silencioso) so faz
// sentido quando um ADJUSTMENT sera REALMENTE criado (divergencia != 0 E
// applyAdjustment=true) -- validado no service, nao no DTO.
export class CreateFuelTankInventoryCheckDto {
  @ApiProperty({ example: 7480, description: 'Estoque fisico medido no tanque, em litros.' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0, { message: 'measuredStockLiters nao pode ser negativo.' })
  measuredStockLiters!: number;

  @ApiProperty({
    example: true,
    description: 'Decisao explicita: aplicar o ADJUSTMENT correspondente a divergencia encontrada (se houver).',
  })
  @IsBoolean()
  applyAdjustment!: boolean;

  @ApiPropertyOptional({
    example: 'Contagem mensal -- vazamento identificado e corrigido na mangueira de saida.',
    description: 'Obrigatorio quando ha divergencia e applyAdjustment=true (secao 7: nenhum ajuste silencioso).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
