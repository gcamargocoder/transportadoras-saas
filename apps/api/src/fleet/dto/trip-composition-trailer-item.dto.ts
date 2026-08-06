import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class TripCompositionTrailerItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'trailerId deve ser um UUID valido.' })
  trailerId!: string;

  @ApiProperty({
    example: 1,
    description: 'Posicao do implemento na composicao (1a carreta, 2a carreta...).',
  })
  @IsInt()
  @Min(1, { message: 'positionOrder deve comecar em 1.' })
  positionOrder!: number;
}
