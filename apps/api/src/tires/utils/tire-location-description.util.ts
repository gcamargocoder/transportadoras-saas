import { TireLocationType } from '@prisma/client';

// Descricao textual de uma localizacao/movimentacao de pneu (Fase 20) --
// funcao pura, sem dependencia de Prisma/service, usada em
// TiresService.getHistory para montar a timeline consolidada.
export interface TireLocationSnapshot {
  type: TireLocationType | null;
  vehiclePlate: string | null;
  trailerPlate: string | null;
  position: string | null;
}

export function describeTireLocation(location: TireLocationSnapshot): string {
  if (!location.type || location.type === TireLocationType.STOCK) return 'Estoque';

  const suffix = location.position ? ` (${location.position})` : '';
  if (location.type === TireLocationType.VEHICLE) {
    return `Veiculo ${location.vehiclePlate ?? '?'}${suffix}`;
  }
  return `Carreta ${location.trailerPlate ?? '?'}${suffix}`;
}

export function describeTireMovement(
  previous: TireLocationSnapshot,
  next: TireLocationSnapshot,
): string {
  return `${describeTireLocation(previous)} -> ${describeTireLocation(next)}`;
}
