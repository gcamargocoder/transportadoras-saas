'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader } from '../../components/ui/card';
import type { FleetVehicleRankingEntryEntity } from '../../types/entities';

// Extraido de operations/fleet/fuel/page.tsx (Fase 42) para ser reaproveitado
// tambem no dashboard de veiculos/frota, sem duplicar a mesma lista
// ranqueada em 2 lugares. `getHref` opcional (usado pelo dashboard de
// veiculos para linkar a placa em /vehicles/[id]) -- sem quebrar o uso
// existente em fuel/page.tsx, que nao passa essa prop.
export function RankingCard({
  title,
  icon: Icon,
  entries,
  formatValue,
  getHref,
  emptyMessage = 'Sem dados no período/filtro selecionado.',
}: {
  title: string;
  icon: LucideIcon;
  entries: FleetVehicleRankingEntryEntity[];
  formatValue: (value: number) => string;
  getHref?: (entry: FleetVehicleRankingEntryEntity) => string;
  emptyMessage?: string;
}): JSX.Element {
  return (
    <Card>
      <CardHeader title={title} />
      {entries.length === 0 ? (
        <p className="p-5 text-sm text-ink-muted">{emptyMessage}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {entries.map((entry, index) => (
            <li key={entry.vehicleId} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="flex items-center gap-2 text-sm text-ink">
                <Icon size={14} className="text-ink-subtle" />
                <span className="text-xs text-ink-subtle">{index + 1}.</span>{' '}
                {getHref ? (
                  <Link href={getHref(entry)} className="hover:underline">
                    {entry.plate}
                  </Link>
                ) : (
                  entry.plate
                )}
              </span>
              <span className="text-sm font-medium text-ink">{formatValue(entry.value)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
