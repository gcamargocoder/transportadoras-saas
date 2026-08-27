import { ApiProperty } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';

export class CustomerTripsByStatusEntity {
  @ApiProperty({ enum: TripStatus })
  status!: TripStatus;

  @ApiProperty()
  count!: number;
}

// Fase 93 -- indicadores basicos, NAO financeiros (regra "nao criar calculo
// financeiro paralelo"): apenas contagens/datas derivadas de Trip/Contract/
// CustomerContact/CustomerNote, sempre via query agregada (groupBy/count),
// nunca um loop por viagem. Indicadores financeiros continuam vindo dos
// dashboards ja existentes (ReceivablesDashboardService, BillingDashboard),
// consumidos diretamente pelo frontend.
export class CustomerSummaryEntity {
  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  tripsTotal!: number;

  @ApiProperty({ type: [CustomerTripsByStatusEntity] })
  tripsByStatus!: CustomerTripsByStatusEntity[];

  @ApiProperty({ nullable: true })
  firstTripAt!: Date | null;

  @ApiProperty({ nullable: true })
  lastTripAt!: Date | null;

  @ApiProperty()
  contactsCount!: number;

  @ApiProperty()
  notesCount!: number;

  @ApiProperty()
  contractsTotal!: number;

  @ApiProperty()
  activeContractsCount!: number;
}
