import { ApiProperty } from '@nestjs/swagger';

// Fase 89 -- item de comparacao entre a sequencia ATUAL (TripDeliveryStop.
// sequence) e a sequencia SUGERIDA pelo motor de roteirizacao desta fase
// (ver TripRoutingService). Nunca persistido -- calculado sob demanda.
export class TripRoutingSuggestionItemEntity {
  @ApiProperty({ format: 'uuid' })
  stopId!: string;

  @ApiProperty()
  currentSequence!: number;

  @ApiProperty()
  suggestedSequence!: number;

  @ApiProperty({ nullable: true })
  customerName!: string | null;

  @ApiProperty()
  locationName!: string;

  @ApiProperty({ nullable: true })
  locationAddress!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Previsao de chegada informada manualmente -- sinal usado para ordenar a sugestao.',
  })
  plannedArrival!: Date | null;

  @ApiProperty({ description: 'false quando o local desta parada nao tem endereco cadastrado.' })
  hasAddress!: boolean;
}

// Fase 89 -- distanceMeters/durationSeconds SEMPRE null nesta fase: nenhuma
// coordenada geografica e capturada para Location nesta instalacao (ver
// docs/trip-routing.md) -- nunca inventados. routingProviderConfigured e
// somente informativo (RoutingService.isProviderConfigured()).
export class TripRoutingSuggestionEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty()
  generatedAt!: Date;

  @ApiProperty({ description: 'true quando a sequencia sugerida difere da sequencia atual.' })
  changed!: boolean;

  @ApiProperty({ type: TripRoutingSuggestionItemEntity, isArray: true, description: 'Ordenado pela sequencia sugerida.' })
  items!: TripRoutingSuggestionItemEntity[];

  @ApiProperty({ nullable: true })
  distanceMeters!: number | null;

  @ApiProperty({ nullable: true })
  durationSeconds!: number | null;

  @ApiProperty()
  routingProviderConfigured!: boolean;

  @ApiProperty({ type: String, isArray: true })
  limitations!: string[];
}

// Fase 89 -- resultado de POST .../routing-suggestion/apply. applied=false
// quando a sugestao ja era igual a sequencia atual (nada para aplicar,
// nenhum RouteVersion novo criado).
export class ApplyTripRoutingSuggestionEntity {
  @ApiProperty()
  applied!: boolean;

  @ApiProperty({ format: 'uuid', nullable: true })
  routeVersionId!: string | null;

  @ApiProperty({ nullable: true })
  routeVersionNumber!: number | null;
}
