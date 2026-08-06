import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { TripCompositionTrailerItemDto } from './trip-composition-trailer-item.dto';
import { UpsertAxleConfigurationDto } from './upsert-axle-configuration.dto';

// tripId NAO faz parte do payload: a composicao nasce sem viagem associada
// (ver comentario em schema.prisma) -- sera vinculada pelo futuro modulo de
// Viagens.
export class CreateTripCompositionDto {
  @ApiProperty({ format: 'uuid', description: 'Cavalo mecanico (Vehicle) da composicao.' })
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId!: string;

  @ApiPropertyOptional({
    type: [TripCompositionTrailerItemDto],
    description: 'Implementos, em ordem (1 = 1a carreta, 2 = 2a carreta -- cobre bitrem/rodotrem).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4, { message: 'no maximo 4 implementos por composicao.' })
  @ValidateNested({ each: true })
  @Type(() => TripCompositionTrailerItemDto)
  trailers?: TripCompositionTrailerItemDto[];

  @ApiPropertyOptional({ type: UpsertAxleConfigurationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertAxleConfigurationDto)
  axleConfiguration?: UpsertAxleConfigurationDto;
}
