'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, MapPinned, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { replaceTollRouteStops } from '../../lib/api/toll-routes.api';
import type { TollPlazaEntity, TollRouteEntity } from '../../types/entities';
import { formatCurrency } from '../../utils/format';
import { PlazaPicker } from './plaza-picker';

// Gestao das paradas (pracas esperadas) de uma rota, em ordem. Toda mudanca
// (adicionar/remover/reordenar) envia a lista INTEIRA de tollPlazaId na
// nova ordem para PUT /toll-routes/:id/stops -- espelha exatamente a
// convencao "substituicao completa" ja usada pelo backend (ver
// ReplaceTollRouteStopsDto), sem endpoints incrementais.
export function RouteStopsEditor({
  route,
  canEdit,
}: {
  route: TollRouteEntity;
  canEdit: boolean;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [addingPlaza, setAddingPlaza] = useState<TollPlazaEntity | null>(null);

  const mutation = useMutation({
    mutationFn: (tollPlazaIds: string[]) => replaceTollRouteStops(route.id, tollPlazaIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['toll-routes', route.id] });
      queryClient.invalidateQueries({ queryKey: ['toll-routes', 'list'] });
    },
    onError: (error) =>
      toast.error('Não foi possível atualizar as paradas da rota.', toFriendlyMessage(error)),
  });

  function handleAdd(plaza: TollPlazaEntity) {
    if (route.stops.some((stop) => stop.tollPlazaId === plaza.id)) {
      toast.error('Esta praça já faz parte da rota.');
      setAddingPlaza(null);
      return;
    }
    mutation.mutate([...route.stops.map((stop) => stop.tollPlazaId), plaza.id]);
    setAddingPlaza(null);
  }

  function handleRemove(tollPlazaId: string) {
    mutation.mutate(
      route.stops
        .filter((stop) => stop.tollPlazaId !== tollPlazaId)
        .map((stop) => stop.tollPlazaId),
    );
  }

  function handleMove(index: number, direction: -1 | 1) {
    const ids = route.stops.map((stop) => stop.tollPlazaId);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved as string);
    mutation.mutate(ids);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3 rounded-lg border border-border bg-surface-subtle p-4 text-sm">
        <Badge tone="brand">ORIGEM · {route.originLabel}</Badge>
        {route.stops.map((stop) => (
          <span key={stop.tollPlazaId} className="flex items-center gap-2">
            <span className="text-ink-subtle">→</span>
            <Badge tone="neutral">
              {stop.sequence}. {stop.tollPlazaName}
            </Badge>
          </span>
        ))}
        <span className="text-ink-subtle">→</span>
        <Badge tone="brand">DESTINO · {route.destinationLabel}</Badge>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        {route.stops.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-subtle">
            Nenhuma praça esperada cadastrada ainda. Adicione a primeira praça abaixo.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {route.stops.map((stop, index) => (
              <li key={stop.tollPlazaId} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                  {stop.sequence}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{stop.tollPlazaName}</p>
                  <p className="text-xs text-ink-subtle">
                    {stop.highway ?? 'Rodovia não informada'} ·{' '}
                    {stop.pricePerAxle === null
                      ? 'sem tarifa cadastrada'
                      : `${formatCurrency(stop.pricePerAxle)}/eixo`}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === 0 || mutation.isPending}
                      onClick={() => handleMove(index, -1)}
                      aria-label="Mover praça para cima"
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === route.stops.length - 1 || mutation.isPending}
                      onClick={() => handleMove(index, 1)}
                      aria-label="Mover praça para baixo"
                    >
                      <ArrowDown size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={mutation.isPending}
                      onClick={() => handleRemove(stop.tollPlazaId)}
                      aria-label="Remover praça da rota"
                    >
                      <Trash2 size={14} className="text-danger-600" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border-strong p-3">
          <MapPinned size={16} className="shrink-0 text-ink-subtle" />
          <div className="flex-1">
            <PlazaPicker
              selectedPlaza={addingPlaza}
              onSelect={handleAdd}
              onClear={() => setAddingPlaza(null)}
              disabled={mutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}
