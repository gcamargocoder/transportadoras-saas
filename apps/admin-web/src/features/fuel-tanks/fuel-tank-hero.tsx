'use client';

import { Badge } from '../../components/ui/badge';
import type { FuelTankEntity, FuelTankMovementEntity } from '../../types/entities';
import { formatDateTime, formatNumber } from '../../utils/format';
import { FUEL_TANK_MOVEMENT_TYPE_LABELS } from '../../lib/labels';
import {
  computeFuelTankSeverity,
  FUEL_TANK_SEVERITY_BADGE_TONE,
  FUEL_TANK_SEVERITY_LABEL,
  FUEL_TANK_SEVERITY_LIQUID,
} from './fuel-tank-severity';

const TANK_WIDTH = 148;
const TANK_HEIGHT = 224;

// Fase 5 -- vasilhame do tanque em CSS puro (div com clipping + gradiente),
// nunca SVG animado: a altura do liquido e uma transicao CSS simples sobre
// currentStockLiters/capacityLiters (occupancyPercent, ja calculado pelo
// backend) -- nenhum calculo visual altera ou reinterpreta o estoque.
function TankVessel({ tank }: { tank: FuelTankEntity }): JSX.Element {
  const severity = computeFuelTankSeverity(tank);
  const liquid = FUEL_TANK_SEVERITY_LIQUID[severity];
  const percent = Math.min(100, Math.max(0, tank.occupancyPercent));
  const minStockPercent =
    tank.minStockLiters !== null && tank.capacityLiters > 0 ? Math.min(100, (tank.minStockLiters / tank.capacityLiters) * 100) : null;

  return (
    <div className="relative shrink-0" style={{ width: TANK_WIDTH, height: TANK_HEIGHT }}>
      {severity === 'critical' && (
        <div className="absolute -inset-1.5 rounded-[32px] ring-2 ring-danger-400/70 motion-safe:animate-pulse" aria-hidden />
      )}
      <div className="absolute inset-0 overflow-hidden rounded-[28px] border-4 border-slate-300 bg-slate-100 shadow-lg">
        {/* Liquido -- unica parte que muda com o estoque. */}
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
          style={{ height: `${percent}%`, background: `linear-gradient(180deg, ${liquid.from} 0%, ${liquid.to} 100%)` }}
        >
          <div className="absolute inset-x-0 top-0 h-2.5 bg-white/25 blur-[1px]" aria-hidden />
        </div>

        {/* Linha do estoque minimo. */}
        {minStockPercent !== null && minStockPercent > 0 && (
          <div
            className="absolute inset-x-0 border-t-2 border-dashed border-white/80"
            style={{ bottom: `${minStockPercent}%` }}
            title={`Estoque mínimo: ${formatNumber(tank.minStockLiters)} L`}
          />
        )}

        {/* Reflexo/vidro -- puramente decorativo. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-y-2 left-2 w-2 rounded-full bg-white/20" aria-hidden />
      </div>
    </div>
  );
}

export function FuelTankHero({
  tank,
  lastMovement,
}: {
  tank: FuelTankEntity;
  lastMovement: FuelTankMovementEntity | undefined;
}): JSX.Element {
  const severity = computeFuelTankSeverity(tank);
  const availableSpace = Math.max(0, tank.capacityLiters - tank.currentStockLiters);

  return (
    <div className="flex flex-col items-center gap-6 rounded-xl border border-border bg-white p-6 shadow-xs sm:flex-row sm:items-stretch sm:gap-10">
      <div className="flex flex-col items-center gap-3">
        <TankVessel tank={tank} />
        <Badge tone={FUEL_TANK_SEVERITY_BADGE_TONE[severity]}>{FUEL_TANK_SEVERITY_LABEL[severity]}</Badge>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">Estoque atual</p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            {formatNumber(tank.currentStockLiters)} <span className="text-xl font-semibold text-ink-muted">L</span>
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {formatNumber(tank.capacityLiters)} L de capacidade · {formatNumber(tank.occupancyPercent, 1)}% ocupado
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <HeroFact label="Estoque mínimo" value={tank.minStockLiters !== null ? `${formatNumber(tank.minStockLiters)} L` : 'Não definido'} />
          <HeroFact label="Espaço disponível" value={`${formatNumber(availableSpace)} L`} />
          <HeroFact
            label="Última movimentação"
            value={
              lastMovement
                ? `${FUEL_TANK_MOVEMENT_TYPE_LABELS[lastMovement.type]} · ${lastMovement.type === 'INTERNAL_FUELING' ? '-' : lastMovement.quantityLiters > 0 ? '+' : ''}${formatNumber(lastMovement.quantityLiters)} L`
                : 'Nenhuma'
            }
          />
          <HeroFact label="Quando" value={lastMovement ? formatDateTime(lastMovement.effectiveDate) : '—'} />
        </div>
      </div>
    </div>
  );
}

function HeroFact({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-xs text-ink-subtle">{label}</p>
      <p className="mt-0.5 font-medium text-ink">{value}</p>
    </div>
  );
}
