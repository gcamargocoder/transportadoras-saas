import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';

// GET /fleet-operations/idle-time (Fase A). UM item = UM periodo ocioso de
// um veiculo (o veiculo pode aparecer em varias linhas: uma por periodo
// entre viagens no historico). "Frota parada agora" (Torre de Controle)
// consome so os itens com isCurrentlyIdle=true.
//
// NAO e o mesmo que /fleet-operations/downtime-cost (parada DENTRO da
// viagem, via TripStop). Aqui e o intervalo entre a chegada de uma viagem e
// a partida da seguinte -- derivado de Trip.actualArrival/actualDeparture,
// sem model/tabela nova.
export class FleetVehicleIdleTimeEntity {
  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  plate!: string;

  @ApiProperty({ format: 'uuid', description: 'Viagem cuja chegada abriu o periodo ocioso.' })
  lastTripId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  lastArrival!: Date;

  @ApiProperty({ nullable: true, description: 'Ultimo destino conhecido (destino da viagem anterior).' })
  lastDestinationLabel!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Viagem que encerrou o periodo -- nulo quando ainda ocioso.' })
  nextTripId!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  nextDeparture!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Inicio do periodo ocioso (= lastArrival).' })
  idleStart!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Fim do periodo -- nulo quando o veiculo segue parado (ver isCurrentlyIdle/isEstimate).',
  })
  idleEnd!: Date | null;

  @ApiProperty({ description: 'Duracao total do periodo ocioso, em minutos (nunca negativa).' })
  totalMinutes!: number;

  @ApiProperty({ description: 'Minutos do periodo cobertos por VehicleMaintenance (sem duplicar minutos entre OSs sobrepostas).' })
  maintenanceMinutes!: number;

  @ApiProperty({ description: 'totalMinutes - maintenanceMinutes: ociosidade que NAO foi manutencao.' })
  netIdleMinutes!: number;

  @ApiProperty({ description: 'true quando este e o periodo em aberto (veiculo sem viagem ativa agora).' })
  isCurrentlyIdle!: boolean;

  @ApiProperty({
    description:
      'true quando idleEnd/totalMinutes sao ESTIMATIVA calculada ate o instante da consulta ("parado desde"), nunca um fim confirmado.',
  })
  isEstimate!: boolean;
}

export class FleetIdleTimeEntity {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Instante da consulta. Periodos com isEstimate=true foram calculados ate aqui.',
  })
  asOf!: Date;

  @ApiProperty({ type: [FleetVehicleIdleTimeEntity] })
  items!: FleetVehicleIdleTimeEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
