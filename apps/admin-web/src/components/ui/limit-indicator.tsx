import { Badge } from './badge';

// Fase 48 -- indicador leve de uso vs. limite do plano ("18 / 20
// utilizados"). `max` null/undefined = sem limite configurado, nao mostra
// nada (nunca inventa um limite). Reaproveita Badge existente, sem
// componente visual novo alem deste wrapper fino.
export function LimitIndicator({
  current,
  max,
  label,
}: {
  current: number;
  max: number | null | undefined;
  label: string;
}): JSX.Element | null {
  if (max == null) return null;

  const atLimit = current >= max;

  return (
    <Badge tone={atLimit ? 'warning' : 'neutral'}>
      {label} {current} / {max} utilizados
      {atLimit ? ' — Limite do plano atingido' : ''}
    </Badge>
  );
}
