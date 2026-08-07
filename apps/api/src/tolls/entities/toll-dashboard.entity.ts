import { ApiProperty } from '@nestjs/swagger';
import { TollTransactionStatus } from '@prisma/client';

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
}
