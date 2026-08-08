import { ApiProperty } from '@nestjs/swagger';
import { RECONCILIATION_STATUSES, ReconciliationStatus } from '../utils/toll-reconciliation.util';
import { TollReconciliationStopEntity } from './toll-reconciliation-stop.entity';
import { TollReconciliationUnplannedEntity } from './toll-reconciliation-unplanned.entity';

// GET /trips/:id/toll-reconciliation -- resultado da conciliacao entre a
// rota de pedagio vinculada a viagem (paradas esperadas, em ordem) e os
// pedagios efetivamente registrados. So existe quando a viagem tem uma
// TollRoute vinculada (hasRoute=false quando nao tem -- viagem continua
// funcionando normalmente, apenas fora da conciliacao).
export class TollReconciliationEntity {
  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({
    description:
      'false quando a viagem nao tem rota de pedagio vinculada -- os demais campos vem zerados/vazios.',
  })
  hasRoute!: boolean;

  @ApiProperty({ format: 'uuid', nullable: true })
  tollRouteId!: string | null;

  @ApiProperty({ nullable: true })
  tollRouteName!: string | null;

  @ApiProperty({ nullable: true })
  originLabel!: string | null;

  @ApiProperty({ nullable: true })
  destinationLabel!: string | null;

  @ApiProperty({ type: [TollReconciliationStopEntity] })
  stops!: TollReconciliationStopEntity[];

  @ApiProperty({
    type: [TollReconciliationUnplannedEntity],
    description:
      'Pedagios registrados nesta viagem que nao correspondem a nenhuma praca esperada da rota.',
  })
  unplannedTransactions!: TollReconciliationUnplannedEntity[];

  @ApiProperty({ description: 'Quantidade de paradas esperadas pela rota.' })
  expectedStopsCount!: number;

  @ApiProperty({ description: 'Quantidade de paradas esperadas que ja tem pedagio registrado.' })
  registeredStopsCount!: number;

  @ApiProperty({
    description:
      'Paradas com tarifa da praca e eixos conhecidos, portanto com veredito conclusivo (CORRECT/OVERCHARGE/UNDERCHARGE).',
  })
  reconciledStopsCount!: number;

  @ApiProperty({ description: 'Quantidade de paradas com veredito CORRECT.' })
  correctCount!: number;

  @ApiProperty({ description: 'Quantidade de paradas com veredito OVERCHARGE.' })
  overchargeCount!: number;

  @ApiProperty({ description: 'Quantidade de paradas com veredito UNDERCHARGE.' })
  underchargeCount!: number;

  @ApiProperty({ description: 'Quantidade de paradas com veredito NOT_REGISTERED.' })
  notRegisteredCount!: number;

  @ApiProperty({ description: 'Quantidade de paradas com veredito UNVERIFIABLE.' })
  unverifiableCount!: number;

  @ApiProperty({ description: 'Quantidade de pedagios registrados fora da rota.' })
  unplannedCount!: number;

  @ApiProperty({ description: 'Soma dos valores esperados calculaveis.' })
  expectedTotalAmount!: number;

  @ApiProperty({ description: 'Soma dos valores cobrados nas paradas esperadas e registradas.' })
  chargedTotalAmount!: number;

  @ApiProperty({ description: 'chargedTotalAmount - expectedTotalAmount.' })
  divergenceAmount!: number;

  @ApiProperty({ description: 'Soma dos valores cobrados em pedagios NAO previstos pela rota.' })
  unplannedTotalAmount!: number;

  @ApiProperty({
    description:
      'correctCount / reconciledStopsCount * 100. 0 quando reconciledStopsCount = 0 (nunca NaN).',
  })
  conformityPercentage!: number;

  @ApiProperty({
    description:
      'true quando todas as paradas esperadas foram registradas corretamente e nao ha pedagio nao previsto.',
  })
  isFullyReconciled!: boolean;

  @ApiProperty({
    enum: RECONCILIATION_STATUSES,
    description:
      'Classificacao geral da conciliacao: PENDING (nada registrado ainda), CONFORM (tudo ' +
      'correto), ATTENTION (um unico problema de presenca), CRITICAL (divergencia financeira ' +
      'ou multiplos problemas) ou UNVERIFIABLE (nenhuma parada pode ser confirmada). Quando ' +
      'hasRoute=false, vem como PENDING junto dos demais campos zerados, sem significado proprio.',
  })
  status!: ReconciliationStatus;
}
