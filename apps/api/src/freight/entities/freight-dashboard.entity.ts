import { ApiProperty } from '@nestjs/swagger';

export class FreightTopCustomerEntity {
  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty()
  freightsCount!: number;
}

export class FreightTopRouteEntity {
  @ApiProperty({ nullable: true })
  originName!: string | null;

  @ApiProperty({ nullable: true })
  destinationName!: string | null;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty()
  freightsCount!: number;
}

export class FreightTopTableEntity {
  @ApiProperty({ format: 'uuid' })
  freightTableId!: string;

  @ApiProperty()
  freightTableName!: string;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty()
  freightsCount!: number;
}

export class ExpiringContractEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  endDate!: Date;
}

// Todos os agregados sao calculados sobre o MESMO lote de TripFreight ja
// carregado no escopo do filtro (periodo/cliente) -- numero de queries
// independente da quantidade de clientes/contratos/regras (secao 14).
export class FreightDashboardEntity {
  @ApiProperty()
  contractedAmountTotal!: number;

  @ApiProperty()
  freightsCount!: number;

  @ApiProperty({ nullable: true, description: 'null quando freightsCount=0 -- nunca 0 mascarando ausencia.' })
  averageTicket!: number | null;

  @ApiProperty()
  realizedRevenueTotal!: number;

  @ApiProperty()
  realizedCostTotal!: number;

  @ApiProperty({ description: 'contractedAmountTotal - realizedCostTotal (ver TripProfitabilityEntity).' })
  projectedMarginTotal!: number;

  @ApiProperty()
  realResultTotal!: number;

  @ApiProperty()
  resultDifferenceTotal!: number;

  @ApiProperty({ type: [FreightTopCustomerEntity] })
  topCustomers!: FreightTopCustomerEntity[];

  @ApiProperty({ type: [FreightTopRouteEntity] })
  topRoutes!: FreightTopRouteEntity[];

  @ApiProperty({ type: [FreightTopTableEntity] })
  topFreightTables!: FreightTopTableEntity[];

  @ApiProperty({ type: [ExpiringContractEntity] })
  contractsExpiringSoon!: ExpiringContractEntity[];

  @ApiProperty({ description: 'Viagens com cliente definido, no periodo, sem tabela/regra aplicavel encontrada.' })
  tripsWithoutApplicableRuleCount!: number;
}
