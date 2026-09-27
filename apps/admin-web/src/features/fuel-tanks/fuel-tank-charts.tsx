'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '../../components/ui/empty-state';
import type { FuelTankMovementEntity } from '../../types/entities';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format';

// Fase 5, secao 5 -- visualizacoes temporais construidas SOMENTE a partir da
// janela de movimentacoes recentes ja carregada pela aba "Visao geral"
// (GET /fuel-tanks/:id/movements, ate 100 registros, mesmo endpoint das
// Fases 1-4). Nenhum endpoint novo foi necessario: agrupar por dia para um
// grafico e uma transformacao de apresentacao, nunca uma nova regra de
// saldo/custo -- os valores agregados (newBalanceLiters, quantityLiters,
// pricePerLiter) ja sao os oficiais do backend. O agrupamento por dia usa a
// MESMA formatDate() exibida no resto do admin-web (mesmo fuso do sistema).

const AXIS_TICK = { fontSize: 11, fill: '#64748b' };
const GRID = '#e2e8f0';

function compactLitersAxis(value: number): string {
  if (Math.abs(value) >= 1000) return `${formatNumber(value / 1000, 1)} mil L`;
  return `${formatNumber(value)} L`;
}

// Evolucao do estoque: 1 ponto por movimentacao, y = newBalanceLiters (o
// saldo OFICIAL apos cada movimento, nunca recalculado aqui).
export function StockEvolutionChart({ movements }: { movements: FuelTankMovementEntity[] }): JSX.Element {
  if (movements.length === 0) {
    return <EmptyState title="Sem movimentações suficientes" description="Ainda não há histórico para desenhar a evolução do estoque." />;
  }
  const rows = [...movements]
    .reverse()
    .map((m) => ({ label: formatDate(m.effectiveDate), saldo: m.newBalanceLiters }));

  return (
    <div className="h-56" role="img" aria-label="Evolução do estoque do tanque ao longo do tempo">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={AXIS_TICK} tickFormatter={compactLitersAxis} />
          <Tooltip
            formatter={(value) => [`${formatNumber(typeof value === 'number' ? value : 0)} L`, 'Saldo']}
            contentStyle={{ borderRadius: 8, borderColor: GRID, fontSize: 12 }}
          />
          <Line dataKey="saldo" name="Saldo" stroke="#b45309" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface DailyBucket {
  label: string;
  entradas: number;
  saidas: number;
}

function bucketByDay(movements: FuelTankMovementEntity[]): DailyBucket[] {
  const buckets = new Map<string, DailyBucket>();
  // Cronologico (mais antigo primeiro) para o eixo X ficar em ordem natural.
  for (const m of [...movements].reverse()) {
    if (m.type !== 'RECEIPT' && m.type !== 'INTERNAL_FUELING') continue;
    const label = formatDate(m.effectiveDate);
    const bucket = buckets.get(label) ?? { label, entradas: 0, saidas: 0 };
    if (m.type === 'RECEIPT') bucket.entradas += m.quantityLiters;
    else bucket.saidas += m.quantityLiters;
    buckets.set(label, bucket);
  }
  return [...buckets.values()];
}

// Entradas x Saidas (a serie "saidas" e tambem o consumo diario -- mesma
// agregacao, nao duplicada num segundo grafico).
export function DailyFlowChart({ movements }: { movements: FuelTankMovementEntity[] }): JSX.Element {
  const rows = bucketByDay(movements);
  if (rows.length === 0) {
    return <EmptyState title="Sem entradas ou saídas suficientes" description="Ainda não há RECEIPT/INTERNAL_FUELING para comparar entradas e saídas." />;
  }
  return (
    <div className="h-56" role="img" aria-label="Entradas e saídas de diesel por dia">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={AXIS_TICK} tickFormatter={compactLitersAxis} />
          <Tooltip
            formatter={(value, name) => [`${formatNumber(typeof value === 'number' ? value : 0)} L`, name]}
            contentStyle={{ borderRadius: 8, borderColor: GRID, fontSize: 12 }}
          />
          <Bar dataKey="entradas" name="Entradas (RECEIPT)" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="saidas" name="Saídas / consumo (INTERNAL_FUELING)" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Custo do diesel ao longo do tempo -- so pontos de RECEIPT com
// pricePerLiter conhecido (nunca inventa preco para abastecimento interno,
// que nao tem custo registrado).
export function DieselCostChart({ movements }: { movements: FuelTankMovementEntity[] }): JSX.Element {
  const rows = [...movements]
    .reverse()
    .filter((m) => m.type === 'RECEIPT' && m.pricePerLiter !== null)
    .map((m) => ({ label: formatDate(m.effectiveDate), preco: m.pricePerLiter as number }));

  if (rows.length === 0) {
    return <EmptyState title="Sem preço suficiente" description="Nenhum recebimento com preço por litro registrado ainda." />;
  }

  return (
    <div className="h-56" role="img" aria-label="Custo do diesel por litro ao longo do tempo">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={AXIS_TICK} tickFormatter={(v) => formatCurrency(v)} />
          <Tooltip
            formatter={(value) => [formatCurrency(typeof value === 'number' ? value : 0), 'Preço/L']}
            contentStyle={{ borderRadius: 8, borderColor: GRID, fontSize: 12 }}
          />
          <Line dataKey="preco" name="Preço/L" stroke="#2a78d6" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
