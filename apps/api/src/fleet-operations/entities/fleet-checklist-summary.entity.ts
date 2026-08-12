import { ApiProperty } from '@nestjs/swagger';

// Fase 40 -- gap real: checklists nao tinham nenhuma agregacao
// (hasCriticalNonConformity so era calculado por execucao individual, ver
// checklists/utils/checklist-non-conformity.util.ts). Aqui e agregado em 1
// query (distinct executionId), nunca em loop por execucao.
export class FleetChecklistSummaryEntity {
  @ApiProperty()
  totalExecutions!: number;

  @ApiProperty()
  completedExecutions!: number;

  @ApiProperty({ description: 'DRAFT + IN_PROGRESS.' })
  pendingExecutions!: number;

  @ApiProperty({ description: 'Execucoes com pelo menos 1 item critico+obrigatorio respondido NAO.' })
  criticalNonConformityCount!: number;
}
