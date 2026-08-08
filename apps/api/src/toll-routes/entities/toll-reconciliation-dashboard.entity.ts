import { ApiProperty } from '@nestjs/swagger';

// GET /toll-routes/dashboard -- visao consolidada de conciliacao para TODAS
// as viagens do tenant que tem rota de pedagio vinculada (viagens sem rota
// ficam de fora, exatamente como na conciliacao individual). Estritamente
// multi-tenant: tudo calculado a partir de Trip.tenantId.
export class TollReconciliationDashboardEntity {
  @ApiProperty({ description: 'Viagens (nao excluidas) com rota de pedagio vinculada.' })
  totalTripsWithRoute!: number;

  @ApiProperty({
    description: 'Viagens 100% conciliadas (todas as paradas CORRECT e sem pedagio nao previsto).',
  })
  reconciledTripsCount!: number;

  @ApiProperty({ description: 'Viagens com rota vinculada mas ainda nao 100% conciliadas.' })
  nonReconciledTripsCount!: number;

  @ApiProperty({
    description:
      'Viagens com status PENDING -- rota vinculada mas ainda sem nenhum pedagio registrado.',
  })
  pendingTripsCount!: number;

  @ApiProperty({ description: 'Viagens com status CONFORM (identico a reconciledTripsCount).' })
  conformTripsCount!: number;

  @ApiProperty({
    description:
      'Viagens com status ATTENTION -- um unico problema de presenca, sem divergencia financeira.',
  })
  attentionTripsCount!: number;

  @ApiProperty({
    description: 'Viagens com status CRITICAL -- divergencia financeira ou multiplos problemas.',
  })
  criticalTripsCount!: number;

  @ApiProperty({
    description: 'Viagens com status UNVERIFIABLE -- nenhuma parada pode ser confirmada.',
  })
  unverifiableTripsCount!: number;

  @ApiProperty({
    description: 'Viagens com pelo menos uma praca esperada nunca registrada (NOT_REGISTERED).',
  })
  tripsWithNotRegisteredCount!: number;

  @ApiProperty({
    description: 'Viagens com pelo menos um pedagio registrado fora da rota (nao previsto).',
  })
  tripsWithUnplannedCount!: number;

  @ApiProperty({
    description: 'Soma das paradas esperadas (praca x viagem) em todas as viagens com rota.',
  })
  totalExpectedStops!: number;

  @ApiProperty({ description: 'Soma das paradas esperadas que ja tem pedagio registrado.' })
  totalRegisteredStops!: number;

  @ApiProperty({ description: 'Soma das paradas esperadas nunca registradas (NOT_REGISTERED).' })
  totalNotRegisteredStops!: number;

  @ApiProperty({
    description:
      'Quantidade de pedagios registrados que nao correspondem a nenhuma praca esperada.',
  })
  totalUnplannedTransactions!: number;

  @ApiProperty({ description: 'Soma dos valores cobrados em pedagios nao previstos.' })
  totalUnplannedAmount!: number;

  @ApiProperty({
    description: 'Soma dos valores esperados calculaveis, em todas as viagens com rota.',
  })
  totalExpectedAmount!: number;

  @ApiProperty({ description: 'Soma dos valores cobrados nas paradas esperadas e registradas.' })
  totalChargedAmount!: number;

  @ApiProperty({ description: 'totalChargedAmount - totalExpectedAmount.' })
  totalDivergenceAmount!: number;

  @ApiProperty({
    description:
      'correctCount / reconciledStopsCount * 100, agregado em todas as viagens com rota. 0 quando nao ha paradas conferiveis (nunca NaN).',
  })
  conformityPercentage!: number;
}
