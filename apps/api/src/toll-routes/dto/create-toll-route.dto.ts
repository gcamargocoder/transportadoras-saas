import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

// As paradas (pracas esperadas, em ordem) NAO fazem parte deste DTO --
// toda rota nasce sem paradas, geridas depois via PUT /toll-routes/:id/stops
// (mesmo principio ja aplicado em CreateTripDto/CreateTireDto: cada
// sub-recurso tem seu proprio endpoint dedicado em vez de payloads
// aninhados gigantes).
export class CreateTollRouteDto {
  @ApiProperty({ example: 'Sao Jose do Rio Preto -> Sao Paulo' })
  @IsString()
  @MinLength(2, { message: 'name e obrigatorio.' })
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 'Sao Jose do Rio Preto' })
  @IsString()
  @MinLength(1, { message: 'originLabel e obrigatorio.' })
  @MaxLength(150)
  originLabel!: string;

  @ApiProperty({ example: 'Sao Paulo' })
  @IsString()
  @MinLength(1, { message: 'destinationLabel e obrigatorio.' })
  @MaxLength(150)
  destinationLabel!: string;
}
