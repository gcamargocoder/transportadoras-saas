import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { TripCompositionTrailerItemDto } from './trip-composition-trailer-item.dto';

export class UpdateTripCompositionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string;

  @ApiPropertyOptional({
    type: [TripCompositionTrailerItemDto],
    description: 'Se informado, SUBSTITUI integralmente a lista de implementos atual.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4, { message: 'no maximo 4 implementos por composicao.' })
  @ValidateNested({ each: true })
  @Type(() => TripCompositionTrailerItemDto)
  trailers?: TripCompositionTrailerItemDto[];
}
