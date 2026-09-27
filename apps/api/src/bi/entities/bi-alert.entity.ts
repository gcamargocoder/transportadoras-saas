import { ApiProperty } from '@nestjs/swagger';
import { ALERT_CONDITION_TYPES, ALERT_SEVERITIES, AlertConditionType, AlertSeverity } from '../alerts/alert-rule.types';
import { KpiPeriodEntity, KpiResultEntity, KpiScopeEntity } from './bi-kpi.entity';

// BI 10 -- alerta = regra + avaliacao sobre um KPI OFICIAL ja calculado.
// `kpi` e o MESMO objeto de /bi/kpis/summary (value/comparison/direction/
// inputs/evidence/formula): a UI reaproveita KpiDetailDrawer sem nenhum
// campo/contrato novo para "como e calculado"/evidencias.
export class AlertEntity {
  @ApiProperty({ description: 'Determinístico (regra+versão+KPI+escopo+período) -- estável entre chamadas, nunca aleatório.' })
  id!: string;

  @ApiProperty()
  ruleId!: string;

  @ApiProperty()
  ruleVersion!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: ALERT_SEVERITIES })
  severity!: AlertSeverity;

  @ApiProperty({ enum: ALERT_CONDITION_TYPES })
  conditionType!: AlertConditionType;

  @ApiProperty({ nullable: true, type: Number, description: 'Limite (ABSOLUTE_THRESHOLD) ou média do período (PERIOD_DEVIATION); null nas demais.' })
  limitValue!: number | null;

  @ApiProperty({ description: 'Rótulo do valor de referência (ex: "limite", "período de comparação"), para a UI montar a frase.' })
  referenceLabel!: string;

  @ApiProperty({ type: KpiResultEntity })
  kpi!: KpiResultEntity;
}

export class AlertsResponseEntity {
  @ApiProperty()
  catalogVersion!: string;

  @ApiProperty()
  calculatedAt!: Date;

  @ApiProperty({ type: KpiScopeEntity })
  scope!: KpiScopeEntity;

  @ApiProperty({ type: KpiPeriodEntity })
  period!: KpiPeriodEntity;

  @ApiProperty({ type: [AlertEntity] })
  items!: AlertEntity[];
}
