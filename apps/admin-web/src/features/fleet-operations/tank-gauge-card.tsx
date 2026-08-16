'use client';

import { Fuel } from 'lucide-react';
import { RadialGauge } from '../../components/ui/radial-gauge';
import type { FleetFuelTankLevelEntity } from '../../types/entities';
import { formatDate, formatNumber } from '../../utils/format';

// Motivo -> texto pt-BR exibido quando available=false. Mantido em sincronia
// com os "reason" gerados por computeTankLevels no backend
// (fleet-operations-metrics.service.ts).
const REASON_LABELS: Record<string, string> = {
  TANK_CAPACITY_NOT_CONFIGURED: 'Capacidade do tanque não cadastrada',
  AVERAGE_CONSUMPTION_NOT_CONFIGURED: 'Consumo médio não cadastrado',
  NO_SUPPLY_RECORDED: 'Sem abastecimento registrado',
  VEHICLE_ODOMETER_NOT_AVAILABLE: 'Odômetro do veículo indisponível',
};

// Nivel de tanque ESTIMADO (nunca sensor real -- ver
// docs/fleet-operations-dashboard.md). Card individual por veiculo, usado
// na grade "Nivel dos tanques" do dashboard de combustivel.
export function TankGaugeCard({ tank }: { tank: FleetFuelTankLevelEntity }): JSX.Element {
  if (!tank.available || tank.percentage === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-subtle p-4 text-center">
        <Fuel size={20} className="text-ink-subtle" />
        <p className="text-sm font-semibold text-ink">{tank.plate}</p>
        <p className="text-xs text-ink-subtle">{REASON_LABELS[tank.reason ?? ''] ?? 'Indisponível'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-white p-4">
      <RadialGauge percentage={tank.percentage} size={88} />
      <p className="text-sm font-semibold text-ink">{tank.plate}</p>
      <p className="text-xs text-ink-muted">
        ≈ {formatNumber(tank.estimatedLevelLiters, 0)} L de {formatNumber(tank.capacityLiters, 0)} L
      </p>
      <p className="text-[11px] text-ink-subtle" title="Estimativa a partir do último abastecimento e do consumo médio cadastrado.">
        Estimado · abastecido em {formatDate(tank.lastSupplyAt)}
      </p>
    </div>
  );
}
