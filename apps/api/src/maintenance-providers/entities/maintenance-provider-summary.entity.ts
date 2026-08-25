import { ApiProperty } from '@nestjs/swagger';

// Secao 4 da Fase 84 -- historico do fornecedor/oficina, sempre reaproveitado
// de VehicleMaintenance (nunca uma segunda fonte de custo/OS). totalCost so
// soma OS com totalCost preenchido (nunca trata ausencia como zero).
export class MaintenanceProviderSummaryEntity {
  @ApiProperty({ description: 'Total de OS em que esta oficina/fornecedor esta vinculado (como workshop OU supplier).' })
  osCount!: number;

  @ApiProperty({ description: 'Veiculos distintos atendidos.' })
  vehiclesServedCount!: number;

  @ApiProperty({ nullable: true, description: 'Soma de VehicleMaintenance.totalCost das OS vinculadas (null se nenhuma tiver custo).' })
  totalCost!: number | null;

  @ApiProperty({ nullable: true, description: 'Data de abertura da OS mais recente vinculada.' })
  lastUsedAt!: Date | null;
}
