import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class ReorderTripDeliveryStopItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'id deve ser um UUID valido.' })
  id!: string;

  @ApiProperty({ example: 1, description: 'Nova posicao da parada na viagem (comeca em 1).' })
  @IsInt()
  @Min(1, { message: 'sequence deve comecar em 1.' })
  sequence!: number;
}

// Reordenacao e sempre da LISTA COMPLETA das paradas da viagem -- o service
// valida que `items` cobre exatamente o mesmo conjunto de ids ja existente
// (nunca aceita um subconjunto, para nao deixar paradas orfas de sequencia).
export class ReorderTripDeliveryStopsDto {
  @ApiProperty({ type: ReorderTripDeliveryStopItemDto, isArray: true })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderTripDeliveryStopItemDto)
  items!: ReorderTripDeliveryStopItemDto[];
}
