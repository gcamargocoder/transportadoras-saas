import { ApiProperty } from '@nestjs/swagger';

export class NextTollEntity {
  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Distancia aproximada (metros) da posicao atual ate esta praca, ao longo da rota.' })
  distanceMeters!: number;

  @ApiProperty({ description: 'Eixos cadastrados (padrao da composicao) -- usados se o motorista nao alterar.' })
  defaultAxles!: number;
}

// Visao MINIMA da rota para o app do motorista (Fase 26) -- so o que o
// mockup pede: destino, proximo pedagio, distancia. Nunca a RoutePlanEntity
// administrativa inteira (polyline, todas as pracas, alternativas...).
export class DriverRouteEntity {
  @ApiProperty()
  destinationLabel!: string;

  @ApiProperty()
  distanceMeters!: number;

  @ApiProperty()
  durationSeconds!: number;

  @ApiProperty({ nullable: true, description: 'Nulo ate a primeira posicao de GPS chegar.' })
  distanceRemainingMeters!: number | null;

  @ApiProperty({ type: NextTollEntity, nullable: true })
  nextToll!: NextTollEntity | null;

  @ApiProperty()
  tollCount!: number;

  @ApiProperty({ nullable: true })
  totalTollAmount!: number | null;

  @ApiProperty({ description: 'Ha um desvio de rota detectado ainda nao resolvido (ver checkDeviation).' })
  hasUnresolvedDeviation!: boolean;
}
