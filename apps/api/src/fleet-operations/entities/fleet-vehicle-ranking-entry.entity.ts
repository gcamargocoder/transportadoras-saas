import { ApiProperty } from '@nestjs/swagger';

// Entrada de ranking reutilizada em custos/manutencao/paradas (Fase 40) --
// "value" tem significado dependente do contexto (custo em R$ ou duracao em
// minutos), documentado em cada uso; evita 3 entities quase identicas.
export class FleetVehicleRankingEntryEntity {
  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty()
  value!: number;

  @ApiProperty()
  count!: number;
}
