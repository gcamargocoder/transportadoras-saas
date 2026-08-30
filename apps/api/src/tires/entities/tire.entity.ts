import { ApiProperty } from '@nestjs/swagger';
import { TireLocationType, TireStatus } from '@prisma/client';

// Fase 64 -- indicadores de vida util (secao 10 do pedido), calculados
// somente em GET /tires/:id (nunca em GET /tires -- evitaria N+1 real numa
// listagem paginada, ja que exige agregacoes extras de recapagens/
// inspecoes/movimentacoes por pneu). costPerKm segue o MESMO padrao ja
// estabelecido em FleetMaintenanceCostPerKmEntity/FleetFuelCostPerKmEntity:
// available/reason nunca mascarados com um valor calculado sobre dado
// ausente.
export class TireCostPerKmEntity {
  @ApiProperty({ nullable: true })
  value!: number | null;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({ nullable: true, description: 'INSUFFICIENT_ODOMETER_READINGS quando available=false.' })
  reason!: string | null;
}

export class TireLifecycleEntity {
  @ApiProperty({ description: 'purchasePrice + soma de TireRetread.cost.' })
  totalCost!: number;

  @ApiProperty({ description: 'Quantidade de recapagens + inspecoes registradas.' })
  interventionsCount!: number;

  @ApiProperty({
    nullable: true,
    description:
      'Dias desde a movimentacao mais recente que instalou o pneu (locationType atual != STOCK). ' +
      'Null quando o pneu esta em estoque ou nunca foi movimentado.',
  })
  daysInstalled!: number | null;

  @ApiProperty({
    type: TireCostPerKmEntity,
    description:
      'Baseado na maior e menor leitura de odometerKm ja registradas nas movimentacoes deste pneu ' +
      '(nunca uma distancia estimada) -- disponivel somente com 2+ leituras distintas.',
  })
  costPerKm!: TireCostPerKmEntity;

  @ApiProperty({
    nullable: true,
    description:
      'Fase 110 -- km percorridos desde a movimentacao que instalou o pneu na posicao atual ' +
      '(Vehicle.odometerKm atual - odometerKm da instalacao). Null quando o pneu nao esta ' +
      'montado em veiculo (carreta nao tem odometro) ou faltam as leituras necessarias.',
  })
  distanceTraveledSinceInstallKm!: number | null;

  @ApiProperty({
    nullable: true,
    description:
      'Fase 110 -- expectedLifespanKm do cadastro do pneu menos distanceTraveledSinceInstallKm. ' +
      'Pode ser negativo (pneu ja rodou alem da vida util esperada). Null quando expectedLifespanKm ' +
      'nao foi cadastrado ou distanceTraveledSinceInstallKm e null.',
  })
  remainingLifespanKm!: number | null;

  @ApiProperty({
    nullable: true,
    description:
      'Fase 110 -- percentual da vida util esperada ja rodado (pode passar de 100). ' +
      'Null nas mesmas condicoes de remainingLifespanKm.',
  })
  lifespanUsedPercent!: number | null;
}

export class TireEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  fireNumber!: string;

  @ApiProperty()
  manufacturer!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  size!: string;

  @ApiProperty({ nullable: true })
  dot!: string | null;

  @ApiProperty({ nullable: true })
  serialNumber!: string | null;

  @ApiProperty({ nullable: true })
  purchaseDate!: Date | null;

  @ApiProperty({ nullable: true })
  purchasePrice!: number | null;

  @ApiProperty({ nullable: true })
  expectedLifespanKm!: number | null;

  @ApiProperty({ nullable: true })
  initialTreadDepthMm!: number | null;

  @ApiProperty({ nullable: true })
  currentTreadDepthMm!: number | null;

  @ApiProperty({ enum: TireStatus })
  status!: TireStatus;

  @ApiProperty({ enum: TireLocationType })
  locationType!: TireLocationType;

  @ApiProperty({ format: 'uuid', nullable: true })
  vehicleId!: string | null;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  trailerId!: string | null;

  @ApiProperty({ nullable: true })
  trailerPlate!: string | null;

  @ApiProperty({ nullable: true })
  position!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ nullable: true })
  creatorName!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  updatedBy!: string | null;

  @ApiProperty({ nullable: true })
  updaterName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({
    type: TireLifecycleEntity,
    nullable: true,
    description: 'Fase 64 -- populado apenas em GET /tires/:id, null em listagens (GET /tires).',
  })
  lifecycle!: TireLifecycleEntity | null;
}
