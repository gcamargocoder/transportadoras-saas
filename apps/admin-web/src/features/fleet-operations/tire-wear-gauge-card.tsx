'use client';

import { CircleDot } from 'lucide-react';
import { RadialGauge } from '../../components/ui/radial-gauge';
import type { FleetTireWearEntity } from '../../types/entities';
import { formatNumber } from '../../utils/format';

// Motivo -> texto pt-BR quando available=false. Mantido em sincronia com os
// "reason" gerados por computeTiresOverview no backend
// (fleet-operations-metrics.service.ts).
const REASON_LABELS: Record<string, string> = {
  INITIAL_TREAD_DEPTH_NOT_CONFIGURED: 'Sulco inicial não cadastrado',
  NO_INSPECTION_RECORDED: 'Sem inspeção registrada',
};

// wearPercentRemaining e leitura DIRETA de inspecao (currentTreadDepthMm /
// initialTreadDepthMm) -- nunca estimado, diferente do TankGaugeCard (que
// precisa de uma premissa de calculo). Card individual por pneu, usado na
// grade "Desgaste dos pneus" do dashboard de pneus.
export function TireWearGaugeCard({ tire }: { tire: FleetTireWearEntity }): JSX.Element {
  if (!tire.available || tire.wearPercentRemaining === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-subtle p-4 text-center">
        <CircleDot size={20} className="text-ink-subtle" />
        <p className="text-sm font-semibold text-ink">{tire.fireNumber}</p>
        <p className="text-xs text-ink-subtle">{REASON_LABELS[tire.reason ?? ''] ?? 'Indisponível'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-white p-4">
      <RadialGauge percentage={tire.wearPercentRemaining} size={88} />
      <p className="text-sm font-semibold text-ink">{tire.fireNumber}</p>
      <p className="text-xs text-ink-muted">
        {tire.vehiclePlate ?? '—'}
        {tire.position ? ` · ${tire.position}` : ''}
      </p>
      <p className="text-[11px] text-ink-subtle" title="Sulco atual sobre sulco inicial, a partir da última inspeção registrada.">
        {formatNumber(tire.currentTreadDepthMm, 1)}mm de {formatNumber(tire.initialTreadDepthMm, 1)}mm
      </p>
    </div>
  );
}
