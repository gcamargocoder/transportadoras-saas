import { ApiProperty } from '@nestjs/swagger';

export class TenantSettingsEntity {
  @ApiProperty()
  timezone!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  language!: string;

  @ApiProperty()
  gpsPingIntervalSeconds!: number;

  @ApiProperty()
  maxDeviationMeters!: number;

  @ApiProperty()
  alertDelayThresholdMin!: number;

  @ApiProperty({
    description:
      'Minutos consecutivos fora da rota planejada para confirmar um desvio sustentado (Fase 26).',
  })
  routeDeviationMinutes!: number;

  @ApiProperty({ type: Object, nullable: true })
  preferences!: Record<string, unknown> | null;
}
