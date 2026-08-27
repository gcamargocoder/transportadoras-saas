import { ApiProperty } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';

// Fase 90 -- um candidato e sempre um PAR (composicao de frota + motorista),
// porque e exatamente isso que TripsService.update aceita ao aplicar uma
// selecao (compositionId + driverId juntos). vehicleAvailable/
// driverAvailable/available sao SEMPRE calculados aqui -- nunca persistidos
// -- e podem mudar entre duas chamadas (ex: outra viagem reservou o mesmo
// veiculo). cargoCapacityKg/totalAxles/vehicleCategory sao APENAS
// informativos (regra 4/5 -- a viagem nao tem peso/carga exigida cadastrada
// para comparar, entao nunca viram criterio de pontuacao).
export class FleetOptimizationCandidateEntity {
  @ApiProperty({ format: 'uuid' })
  compositionId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty()
  vehiclePlate!: string;

  @ApiProperty({ enum: VehicleType })
  vehicleType!: VehicleType;

  @ApiProperty({ nullable: true })
  vehicleCategory!: string | null;

  @ApiProperty({ nullable: true, description: 'Vehicle.cargoCapacityKg -- somente informativo.' })
  cargoCapacityKg!: number | null;

  @ApiProperty({
    nullable: true,
    description: 'AxleConfiguration.totalAxles da composicao, com fallback para Vehicle.axleCount.',
  })
  totalAxles!: number | null;

  @ApiProperty({ format: 'uuid' })
  driverId!: string;

  @ApiProperty()
  driverName!: string;

  @ApiProperty()
  driverCnhCategory!: string;

  @ApiProperty({ description: 'Veiculo/composicao livre para o periodo da viagem, sem conflito de agenda.' })
  vehicleAvailable!: boolean;

  @ApiProperty({ description: 'Motorista ativo, marcado como disponivel, CNH valida na partida, sem conflito de agenda.' })
  driverAvailable!: boolean;

  @ApiProperty({ description: 'vehicleAvailable && driverAvailable.' })
  available!: boolean;

  @ApiProperty({ description: 'true quando este e o par (compositionId, driverId) atualmente aplicado na viagem.' })
  isCurrentSelection!: boolean;

  @ApiProperty({
    description:
      'true quando ha um DriverVehicleAssignment ATUAL (endedAt null) ligando este motorista a este veiculo.',
  })
  hasCurrentDriverVehicleAssignment!: boolean;

  @ApiProperty({ description: '0 quando indisponivel; caso contrario, quanto maior, melhor colocado.' })
  score!: number;

  @ApiProperty({ nullable: true, description: 'Posicao no ranking entre os candidatos DISPONIVEIS (1 = melhor). Null quando indisponivel.' })
  rank!: number | null;

  @ApiProperty({ type: String, isArray: true })
  restrictions!: string[];

  @ApiProperty()
  justification!: string;
}

// Fase 90 -- resultado da analise para UMA viagem planejada. candidates
// inclui sempre a selecao ATUAL da viagem (mesmo se ela propria ficou
// indisponivel desde a criacao da viagem -- ex: motorista com CNH vencida
// nesse meio tempo) + ate 10 melhores pares disponiveis, ordenados por rank.
export class FleetOptimizationResultEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty()
  generatedAt!: Date;

  @ApiProperty({ type: FleetOptimizationCandidateEntity, isArray: true })
  candidates!: FleetOptimizationCandidateEntity[];

  @ApiProperty({ description: 'Composicoes de frota livres e sem conflito de agenda consideradas.' })
  availableCompositionsCount!: number;

  @ApiProperty({ description: 'Motoristas disponiveis e sem conflito de agenda considerados.' })
  availableDriversCount!: number;

  @ApiProperty({ description: 'Total de composicoes candidatas avaliadas (livres ou a atual da viagem).' })
  totalCompositionsConsidered!: number;

  @ApiProperty({ description: 'Total de motoristas ativos avaliados.' })
  totalDriversConsidered!: number;

  @ApiProperty({ type: String, isArray: true })
  limitations!: string[];
}
