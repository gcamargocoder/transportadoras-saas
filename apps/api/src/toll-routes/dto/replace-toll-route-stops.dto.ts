import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { TollRouteStopItemDto } from './toll-route-stop-item.dto';

// Substitui a lista INTEIRA de paradas, na ordem do array (indice 0 = 1a
// praca esperada) -- mesma convencao ja usada em
// UpdateTripCompositionDto.trailers (substituicao total, nao incremental),
// que e a forma mais simples de expressar "reordenar" a partir do
// frontend: basta reenviar o array na nova ordem.
export class ReplaceTollRouteStopsDto {
  @ApiProperty({ type: [TollRouteStopItemDto], description: 'Pracas esperadas, em ordem.' })
  @IsArray()
  @ArrayMaxSize(50, { message: 'no maximo 50 pracas por rota.' })
  @ValidateNested({ each: true })
  @Type(() => TollRouteStopItemDto)
  stops!: TollRouteStopItemDto[];
}
