import { ApiProperty } from '@nestjs/swagger';
import { TollTransactionSource, TollTransactionStatus } from '@prisma/client';
import { TOLL_AUDIT_VERDICTS, TollAuditVerdict } from '../utils/toll-calculation.util';

export class TollTransactionEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  tripId!: string;

  @ApiProperty({ format: 'uuid' })
  vehicleId!: string;

  @ApiProperty({ nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;

  @ApiProperty({ nullable: true })
  driverName!: string | null;

  @ApiProperty({ format: 'uuid' })
  tollPlazaId!: string;

  @ApiProperty()
  tollPlazaName!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  tagProviderId!: string | null;

  @ApiProperty({ nullable: true })
  tagProviderName!: string | null;

  @ApiProperty()
  axleCount!: number;

  @ApiProperty({ description: 'Calculado automaticamente: pricePerAxle * axleCount.' })
  expectedAmount!: number;

  @ApiProperty()
  chargedAmount!: number;

  @ApiProperty({ description: 'Calculado automaticamente: chargedAmount - expectedAmount.' })
  discrepancyAmount!: number;

  @ApiProperty({ enum: TollTransactionStatus })
  status!: TollTransactionStatus;

  @ApiProperty({
    enum: TOLL_AUDIT_VERDICTS,
    description:
      'Motor de conferencia (Fase 22): calculado em tempo de leitura a partir do estado ' +
      'ATUAL de TollPlaza.pricePerAxle -- nunca do expectedAmount/status ja gravados. ' +
      'Distinto de "status": nunca gera falso positivo quando a tarifa da praca e desconhecida.',
  })
  auditVerdict!: TollAuditVerdict;

  @ApiProperty({
    nullable: true,
    description: 'Preenchido apenas quando auditVerdict = UNVERIFIABLE.',
  })
  auditMessage!: string | null;

  @ApiProperty()
  chargedAt!: Date;

  @ApiProperty({ enum: TollTransactionSource })
  source!: TollTransactionSource;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
