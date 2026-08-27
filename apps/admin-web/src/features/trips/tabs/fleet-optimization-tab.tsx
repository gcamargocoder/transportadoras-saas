'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Gauge } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { useToast } from '../../../components/ui/toast';
import { toFriendlyMessage } from '../../../lib/api/errors';
import { getTripFleetOptimization, updateTrip } from '../../../lib/api/trips.api';
import { VEHICLE_TYPE_LABELS } from '../../../lib/labels';
import type { FleetOptimizationCandidateEntity, FleetOptimizationResultEntity } from '../../../types/entities';

function candidateKey(c: { compositionId: string; driverId: string }): string {
  return `${c.compositionId}:${c.driverId}`;
}

// Fase 90 -- camada de decisao "qual veiculo/motorista aplicar nesta
// viagem planejada". Somente ANALISE local (nunca escolhe sozinha, regra
// 6): "aplicar" reaproveita o MESMO updateTrip (PATCH /trips/:id) ja usado
// por UpdateTripPlanModal (Fase 14/87) -- nenhuma mutacao nova, o backend
// ja revalida disponibilidade e ja so aceita com a viagem em PLANNED.
export function FleetOptimizationTab({
  tripId,
  canApply,
}: {
  tripId: string;
  canApply: boolean;
}): JSX.Element {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<FleetOptimizationResultEntity | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: () => getTripFleetOptimization(tripId),
    onSuccess: (data) => {
      setResult(data);
      setSelectedKey(null);
    },
    onError: (error) => toast.error('Não foi possível analisar candidatos.', toFriendlyMessage(error)),
  });

  const applyMutation = useMutation({
    mutationFn: (candidate: FleetOptimizationCandidateEntity) =>
      updateTrip(tripId, { compositionId: candidate.compositionId, driverId: candidate.driverId }),
    onSuccess: () => {
      toast.success('Seleção aplicada ao planejamento da viagem.');
      queryClient.invalidateQueries({ queryKey: ['trips', tripId] });
      setResult(null);
      setSelectedKey(null);
    },
    onError: (error) => toast.error('Não foi possível aplicar a seleção.', toFriendlyMessage(error)),
  });

  const selected = result?.candidates.find((c) => candidateKey(c) === selectedKey) ?? null;

  return (
    <div className="p-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge size={16} className="text-ink-subtle" />
            <div>
              <p className="text-sm font-semibold text-ink">Otimização de frota</p>
              <p className="text-xs text-ink-muted">
                Compara veículo/motorista disponíveis para esta viagem, com pontuação e justificativa.
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" loading={analyzeMutation.isPending} onClick={() => analyzeMutation.mutate()}>
            Solicitar análise
          </Button>
        </div>

        {!canApply && (
          <p className="mt-2 text-xs text-ink-muted">
            Aplicar uma seleção só é possível enquanto a viagem estiver em planejamento (PLANNED).
          </p>
        )}

        {result && (
          <div className="mt-4 flex flex-col gap-3">
            {result.limitations.map((limitation) => (
              <div
                key={limitation}
                className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 p-2.5 text-xs text-warning-700"
              >
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{limitation}</span>
              </div>
            ))}

            {result.candidates.length === 0 ? (
              <p className="text-sm text-ink-muted">Nenhum candidato encontrado para esta viagem.</p>
            ) : (
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium text-ink-muted">
                      <th className="px-2 py-1.5" />
                      <th className="px-2 py-1.5">#</th>
                      <th className="px-2 py-1.5">Veículo</th>
                      <th className="px-2 py-1.5">Motorista</th>
                      <th className="px-2 py-1.5">Disponibilidade</th>
                      <th className="px-2 py-1.5">Pontuação</th>
                      <th className="px-2 py-1.5">Justificativa/restrições</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {result.candidates.map((candidate) => {
                      const key = candidateKey(candidate);
                      return (
                        <tr key={key} className="border-b border-border align-top last:border-0">
                          <td className="px-2 py-2">
                            <input
                              type="radio"
                              name="fleet-optimization-candidate"
                              disabled={!candidate.available || !canApply}
                              checked={selectedKey === key}
                              onChange={() => setSelectedKey(key)}
                              aria-label={`Selecionar ${candidate.vehiclePlate} / ${candidate.driverName}`}
                            />
                          </td>
                          <td className="px-2 py-2 text-ink-muted">{candidate.rank ?? '—'}</td>
                          <td className="px-2 py-2">
                            <div className="font-medium text-ink">{candidate.vehiclePlate}</div>
                            <div className="text-xs text-ink-subtle">
                              {VEHICLE_TYPE_LABELS[candidate.vehicleType]}
                              {candidate.vehicleCategory ? ` · ${candidate.vehicleCategory}` : ''}
                              {candidate.totalAxles !== null ? ` · ${candidate.totalAxles} eixos` : ''}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="font-medium text-ink">{candidate.driverName}</div>
                            <div className="text-xs text-ink-subtle">CNH {candidate.driverCnhCategory}</div>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex flex-col gap-1">
                              <Badge tone={candidate.available ? 'success' : 'danger'}>
                                {candidate.available ? 'Disponível' : 'Indisponível'}
                              </Badge>
                              {candidate.isCurrentSelection && <Badge tone="info">Seleção atual</Badge>}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-ink-muted">{candidate.score}</td>
                          <td className="px-2 py-2 text-xs text-ink-muted">{candidate.justification}</td>
                          <td className="px-2 py-2" />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {canApply && selected && (
              <div className="flex items-center justify-between rounded-md border border-border bg-surface-muted p-3">
                <p className="text-sm text-ink">
                  Aplicar <strong>{selected.vehiclePlate}</strong> + <strong>{selected.driverName}</strong> ao
                  planejamento desta viagem?
                </p>
                <Button size="sm" loading={applyMutation.isPending} onClick={() => applyMutation.mutate(selected)}>
                  <Check size={14} />
                  Aplicar seleção
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
