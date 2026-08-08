import { ApiProperty } from '@nestjs/swagger';
import {
  TOLL_RECONCILIATION_STOP_VERDICTS,
  TollReconciliationStopVerdict,
} from '../utils/toll-reconciliation.util';

// Uma linha da conciliacao: uma parada (praca) ESPERADA da rota, comparada
// com o pedagio efetivamente registrado para aquela praca nesta viagem
// (quando existir).
export class TollReconciliationStopEntity {
  @ApiProperty({ description: 'Posicao da praca na rota (1a, 2a...).' })
  sequence!: number;

  @ApiProperty({ format: 'uuid' })
  tollPlazaId!: string;

  @ApiProperty()
  tollPlazaName!: string;

  @ApiProperty({ nullable: true })
  highway!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Transacao de pedagio que cobre esta praca, quando ja registrada.',
  })
  transactionId!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Quantidade de eixos usada no calculo (da composicao/eixos da viagem).',
  })
  axleCount!: number | null;

  @ApiProperty({
    nullable: true,
    description: 'pricePerAxle da praca (atual) * axleCount. Null quando nao e possivel calcular.',
  })
  expectedAmount!: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Valor efetivamente cobrado. Null quando nao registrado.',
  })
  chargedAmount!: number | null;

  @ApiProperty({ nullable: true })
  discrepancyAmount!: number | null;

  @ApiProperty({
    enum: TOLL_RECONCILIATION_STOP_VERDICTS,
    description:
      'CORRECT/OVERCHARGE/UNDERCHARGE/UNVERIFIABLE (mesmo motor de conferencia da Fase 22) ' +
      'ou NOT_REGISTERED quando a praca era esperada mas nenhum pedagio foi registrado.',
  })
  verdict!: TollReconciliationStopVerdict;

  @ApiProperty({ nullable: true })
  message!: string | null;
}
