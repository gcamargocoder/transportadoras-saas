'use client';

import { Badge } from '../../components/ui/badge';
import { SearchCombobox } from '../../components/ui/search-combobox';
import { listTrips } from '../../lib/api/trips.api';
import { TRIP_STATUS_LABELS } from '../../lib/labels';
import { TRIP_STATUS_TONE } from '../trips/status';
import type { TripEntity } from '../../types/entities';
import { formatDateTime } from '../../utils/format';

const PAGE_SIZE = 20;

// Busca real (debounced) de viagens para o registro de pedagio -- nunca
// carrega mais que PAGE_SIZE de uma vez. So mostra viagens que ja tem uma
// composicao (veiculo) vinculada, porque TollTransactionsService.create()
// exige isso (evita o usuario escolher uma viagem e so descobrir o erro no
// submit).
export function TripPicker({
  id,
  selectedTrip,
  onSelect,
  onClear,
  invalid,
  disabled,
}: {
  id?: string;
  selectedTrip: TripEntity | null;
  onSelect: (trip: TripEntity) => void;
  onClear: () => void;
  invalid?: boolean;
  disabled?: boolean;
}): JSX.Element {
  return (
    <SearchCombobox<TripEntity>
      id={id}
      selectedItem={selectedTrip}
      onSelect={onSelect}
      onClear={onClear}
      invalid={invalid}
      disabled={disabled}
      placeholder="Buscar por origem, destino, cliente..."
      emptyLabel="Nenhuma viagem com veículo vinculado encontrada."
      queryKey={(search) => ['trips', 'picker', search]}
      queryFn={async (search) => {
        const result = await listTrips({ search: search || undefined, pageSize: PAGE_SIZE });
        return { items: result.items.filter((trip) => trip.compositionId !== null) };
      }}
      getOptionValue={(trip) => trip.id}
      getDisplayText={(trip) =>
        `${trip.originName} → ${trip.destinationName} · ${trip.vehiclePlate ?? ''}`
      }
      renderOption={(trip) => (
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-ink">
              {trip.originName} → {trip.destinationName}
            </p>
            <Badge tone={TRIP_STATUS_TONE[trip.status]}>{TRIP_STATUS_LABELS[trip.status]}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {trip.vehiclePlate ?? 'Sem veículo'} · {trip.driverName ?? 'Sem motorista'} ·{' '}
            {formatDateTime(trip.plannedDeparture)}
          </p>
        </div>
      )}
    />
  );
}
