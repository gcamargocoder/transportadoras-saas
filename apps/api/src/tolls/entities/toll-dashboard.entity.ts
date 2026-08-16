import { ApiProperty } from '@nestjs/swagger';
import { TollTransactionStatus } from '@prisma/client';
import { DashboardChartPointEntity } from '../../dashboard/entities/dashboard-charts.entity';

export class TollDashboardGroupEntity {
  @ApiProperty({ format: 'uuid', nullable: true })
  id!: string | null;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  totalChargedAmount!: number;
}

export class TollDashboardStatusGroupEntity {
  @ApiProperty({ enum: TollTransactionStatus })
  status!: TollTransactionStatus;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  totalChargedAmount!: number;
}

// GET /toll-transactions/dashboard -- visao consolidada, aceita os mesmos
// filtros de GET /toll-transactions (periodo, veiculo, motorista, operadora,
// praca, status) para permitir dashboards recortados.
export class TollDashboardEntity {
  @ApiProperty({ description: 'Total de transacoes de pedagio.' })
  totalCount!: number;

  @ApiProperty({ description: 'Soma dos valores cobrados.' })
  totalChargedAmount!: number;

  @ApiProperty({ description: 'Soma dos valores esperados (calculados).' })
  totalExpectedAmount!: number;

  @ApiProperty({ description: 'Soma das diferencas (cobrado - esperado).' })
  totalDiscrepancyAmount!: number;

  @ApiProperty({ type: [TollDashboardStatusGroupEntity] })
  countByStatus!: TollDashboardStatusGroupEntity[];

  @ApiProperty({ type: [TollDashboardGroupEntity] })
  countByProvider!: TollDashboardGroupEntity[];

  @ApiProperty({ type: [TollDashboardGroupEntity] })
  countByVehicle!: TollDashboardGroupEntity[];

  @ApiProperty({ type: [TollDashboardGroupEntity] })
  countByDriver!: TollDashboardGroupEntity[];

  @ApiProperty({ type: [TollDashboardGroupEntity] })
  countByPlaza!: TollDashboardGroupEntity[];

  // Motor de conferencia (Fase 22) -- calculado sempre a partir do estado
  // ATUAL de TollPlaza.pricePerAxle (ver computeAuditVerdict), nunca dos
  // valores de status/expectedAmount ja gravados acima.
  @ApiProperty({
    description: 'Transacoes com tarifa da praca conhecida (correta, acima ou abaixo do esperado).',
  })
  conferredCount!: number;

  @ApiProperty({
    description:
      'Transacoes cuja praca nao tem tarifa por eixo cadastrada -- nao entram no percentual de conformidade.',
  })
  unverifiableCount!: number;

  @ApiProperty({ description: 'Cobradas dentro do esperado (dentro da tolerancia de centavos).' })
  correctCount!: number;

  @ApiProperty({ description: 'Cobradas acima do esperado.' })
  overchargeCount!: number;

  @ApiProperty({ description: 'Cobradas abaixo do esperado.' })
  underchargeCount!: number;

  @ApiProperty({
    description: 'correctCount / conferredCount * 100. 0 quando conferredCount = 0 (nunca NaN).',
  })
  conformityPercentage!: number;

  @ApiProperty({
    type: [DashboardChartPointEntity],
    description: 'Ultimos 12 meses, sempre (ignora chargedFrom/chargedTo). Soma de chargedAmount por mes.',
  })
  monthlyTrendChargedAmount!: DashboardChartPointEntity[];
}
