'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { ErrorState } from '../../components/ui/error-state';
import { Input } from '../../components/ui/input';
import { SkeletonCards } from '../../components/ui/skeleton';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { getTenantSettings, updateTenantSettings } from '../../lib/api/admin.api';
import { TRIP_STOP_TYPE_LABELS } from '../../lib/labels';
import { TripStopType } from '../../types/enums';

const STOP_TYPES = Object.keys(TRIP_STOP_TYPE_LABELS) as TripStopType[];
const PREFERENCES_KEY = 'stopDurationThresholdsMinutes';

function readThresholds(preferences: Record<string, unknown> | null): Record<string, number> {
  const raw = preferences?.[PREFERENCES_KEY];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) result[key] = value;
  }
  return result;
}

// Fase 44, secao 13 -- editor pequeno, dentro da propria pagina de Gestao
// Operacional de paradas (nunca um painel administrativo separado).
// Reaproveita GET/PATCH /tenant-settings (Fase 8) -- nenhum endpoint novo.
// So visivel para ADMIN/SUPER_ADMIN (mesmo RBAC do backend), ver page.tsx.
// Campo vazio = sem limite configurado para o tipo (usa o padrao do
// backend, ou nenhum alerta se o tipo tambem nao tiver padrao).
export function StopDurationThresholdsEditor(): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const query = useQuery({ queryKey: ['tenant-settings'], queryFn: () => getTenantSettings() });

  useEffect(() => {
    if (!query.data) return;
    const thresholds = readThresholds(query.data.preferences);
    setEdited(Object.fromEntries(STOP_TYPES.map((type) => [type, thresholds[type] !== undefined ? String(thresholds[type]) : ''])));
  }, [query.data]);

  async function persist(next: Record<string, string>): Promise<void> {
    setSaving(true);
    try {
      const thresholds: Record<string, number> = {};
      for (const type of STOP_TYPES) {
        const raw = next[type];
        const value = raw ? Number(raw) : NaN;
        if (Number.isFinite(value) && value > 0) thresholds[type] = value;
      }
      await updateTenantSettings({ preferences: { ...(query.data?.preferences ?? {}), [PREFERENCES_KEY]: thresholds } });
      await queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['fleet-operations', 'stops'] });
      toast.success('Limites de duração salvos.');
    } catch (error) {
      toast.error('Não foi possível salvar os limites.', toFriendlyMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (query.isLoading) return <SkeletonCards count={1} />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;

  return (
    <Card>
      <CardHeader
        title="Limites de duração de parada (por tipo)"
        description="Paradas concluídas que excedem o limite geram um alerta de duração longa. Deixe em branco para não alertar esse tipo."
      />
      <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {STOP_TYPES.map((type) => (
          <label key={type} className="flex items-center justify-between gap-2 text-sm text-ink">
            <span className="text-ink-muted">{TRIP_STOP_TYPE_LABELS[type]}</span>
            <Input
              type="number"
              min={1}
              step={1}
              className="w-24"
              aria-label={`Limite (minutos) para ${TRIP_STOP_TYPE_LABELS[type]}`}
              value={edited[type] ?? ''}
              onChange={(e) => setEdited((prev) => ({ ...prev, [type]: e.target.value }))}
              placeholder="min"
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button
          variant="outline"
          disabled={saving}
          onClick={() => {
            const cleared = Object.fromEntries(STOP_TYPES.map((type) => [type, '']));
            setEdited(cleared);
            void persist(cleared);
          }}
        >
          Restaurar padrão
        </Button>
        <Button loading={saving} onClick={() => void persist(edited)}>
          Salvar
        </Button>
      </div>
    </Card>
  );
}
