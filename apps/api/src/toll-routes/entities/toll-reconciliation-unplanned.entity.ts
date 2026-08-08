import { ApiProperty } from '@nestjs/swagger';

// Pedagio registrado nesta viagem cuja praca NAO faz parte da rota vinculada
// -- exibido separado da lista de paradas esperadas (nunca misturado com
// CORRECT/OVERCHARGE/UNDERCHARGE/NOT_REGISTERED).
export class TollReconciliationUnplannedEntity {
  @ApiProperty({ format: 'uuid' })
  transactionId!: string;

  @ApiProperty({ format: 'uuid' })
  tollPlazaId!: string;

  @ApiProperty()
  tollPlazaName!: string;

  @ApiProperty()
  chargedAmount!: number;

  @ApiProperty()
  chargedAt!: Date;
}
