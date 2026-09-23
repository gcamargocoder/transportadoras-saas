'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Drawer } from '../../components/ui/drawer';
import type { KpiResultEntity } from '../../types/entities';
import { formatNumber } from '../../utils/format';
import { KPI_DRILL_DOWN } from './intelligence-config';
import { formatKpiValue } from './kpi-format';
import { formatPeriodLabel } from './period';

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="border-b border-border px-4 py-4 last:border-b-0">
      <h3 className="mb-2 text-xs font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

// Contexto de um KPI: tudo vem da resposta de /bi/kpis/summary (nenhuma
// chamada extra). E a mesma cadeia que uma futura camada de IA vai ler:
// KPI -> formula -> entradas -> evidencias -> registros de origem.
export function KpiDetailDrawer({
  kpi,
  onClose,
}: {
  kpi: KpiResultEntity | null;
  onClose: () => void;
}): JSX.Element | null {
  if (!kpi) return null;
  const drill = KPI_DRILL_DOWN[kpi.id];

  return (
    <Drawer open onClose={onClose} title={kpi.name}>
      <div className="text-sm">
        <div className="bg-violet-50 px-4 py-4">
          <p className="text-xs font-medium text-violet-800">Como é calculado</p>
          <p className="mt-1 font-medium text-violet-950">{kpi.formula}</p>
          <p className="mt-2 text-xs text-violet-900/80">{kpi.description}</p>
        </div>

        <Section title="Resultado">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <dt className="text-ink-muted">Período</dt>
            <dd className="text-right text-ink">{formatPeriodLabel(kpi.period.start, kpi.period.end)}</dd>
            <dt className="text-ink-muted">Valor</dt>
            <dd className="text-right font-semibold text-ink">{formatKpiValue(kpi.unit, kpi.value)}</dd>
            {kpi.comparison && (
              <>
                <dt className="text-ink-muted">Período anterior</dt>
                <dd className="text-right text-ink">
                  {formatPeriodLabel(kpi.comparison.period.start, kpi.comparison.period.end)}
                </dd>
                <dt className="text-ink-muted">Valor anterior</dt>
                <dd className="text-right text-ink">{formatKpiValue(kpi.unit, kpi.comparison.value)}</dd>
              </>
            )}
          </dl>
          {kpi.unavailableReason && <p className="mt-3 text-xs text-warning-700">{kpi.unavailableReason}</p>}
        </Section>

        {kpi.inputs.length > 0 && (
          <Section title="Valores considerados">
            <ul className="flex flex-col gap-1.5 text-xs">
              {kpi.inputs.map((input) => (
                <li key={input.key} className="flex justify-between gap-3">
                  <span className="text-ink-muted">{input.label}</span>
                  <span className="text-right font-medium tabular-nums text-ink">{formatKpiValue(input.unit, input.value)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {kpi.evidence.length > 0 && (
          <Section title="Registros de origem">
            <ul className="flex flex-col gap-1.5 text-xs">
              {kpi.evidence.map((evidence) => (
                <li key={evidence.source} className="flex justify-between gap-3">
                  <span className="text-ink-muted">{evidence.label}</span>
                  <span className="font-medium tabular-nums text-ink">{formatNumber(evidence.recordCount)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Fontes">
          <ul className="flex flex-col gap-2 text-xs">
            {kpi.sources.map((source) => (
              <li key={`${source.entity}-${source.field}`}>
                <p className="font-medium text-ink">{source.entity}</p>
                <p className="text-ink-muted">
                  Campo {source.field}, recortado por {source.dateField}
                </p>
                <p className="text-ink-muted">{source.rule}</p>
              </li>
            ))}
          </ul>
        </Section>

        {kpi.limitations.length > 0 && (
          <Section title="Limitações">
            <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-ink-muted">
              {kpi.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </Section>
        )}

        {drill && (
          <div className="px-4 py-4">
            <Link
              href={drill.href}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900"
            >
              {drill.label}
              <ArrowRight size={13} aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </Drawer>
  );
}
