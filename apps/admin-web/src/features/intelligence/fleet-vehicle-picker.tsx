'use client';

import { SearchCombobox } from '../../components/ui/search-combobox';
import { listVehicles } from '../../lib/api/fleet.api';
import type { VehicleEntity } from '../../types/entities';

const PAGE_SIZE = 20;

// Mesmo padrao de PlazaPicker (features/tolls): busca real por placa/marca/
// modelo, em vez de um <select> com pageSize fixo -- uma frota pode ter mais
// veiculos do que uma pagina carregaria de uma vez.
export function FleetVehiclePicker({
  id,
  selectedVehicle,
  onSelect,
  onClear,
  disabled,
}: {
  id?: string;
  selectedVehicle: VehicleEntity | null;
  onSelect: (vehicle: VehicleEntity) => void;
  onClear: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <SearchCombobox<VehicleEntity>
      id={id}
      selectedItem={selectedVehicle}
      onSelect={onSelect}
      onClear={onClear}
      disabled={disabled}
      placeholder="Buscar por placa, marca, modelo..."
      emptyLabel="Nenhum veículo encontrado."
      queryKey={(search) => ['vehicles', 'picker', search]}
      queryFn={async (search) => listVehicles({ search: search || undefined, pageSize: PAGE_SIZE })}
      getOptionValue={(vehicle) => vehicle.id}
      getDisplayText={(vehicle) => `${vehicle.plate} · ${vehicle.brand} ${vehicle.model}`}
      renderOption={(vehicle) => (
        <div>
          <p className="font-medium text-ink">{vehicle.plate}</p>
          <p className="text-xs text-ink-subtle">
            {vehicle.brand} {vehicle.model}
          </p>
        </div>
      )}
    />
  );
}
