import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min, MaxLength } from 'class-validator';

// Registro MANUAL da configuracao de eixos (levantados/abaixados/suspensos/
// direcionais/tracao) e da categoria de cobranca. O schema documenta
// billableCategory como "calculada" a partir dos demais campos, mas o
// CALCULO fica para a fase de Pedagios -- aqui e informado manualmente.
export class UpsertAxleConfigurationDto {
  @ApiProperty({ example: 6, description: 'Total de eixos da composicao (cavalo + implementos).' })
  @IsInt()
  @Min(2, { message: 'totalAxles deve ser no minimo 2.' })
  totalAxles!: number;

  @ApiProperty({ example: 1, default: 0 })
  @IsInt()
  @Min(0)
  raisedAxles = 0;

  @ApiProperty({ example: 4, default: 0 })
  @IsInt()
  @Min(0)
  loweredAxles = 0;

  @ApiProperty({ example: 0, default: 0 })
  @IsInt()
  @Min(0)
  suspendedAxles = 0;

  @ApiProperty({ example: 1, default: 0 })
  @IsInt()
  @Min(0)
  steeringAxles = 0;

  @ApiProperty({ example: 2, default: 0 })
  @IsInt()
  @Min(0)
  tractionAxles = 0;

  @ApiProperty({
    example: '6 eixos',
    description: 'Categoria de cobranca usada pelas concessionarias.',
  })
  @IsString()
  @MaxLength(30)
  billableCategory!: string;
}
