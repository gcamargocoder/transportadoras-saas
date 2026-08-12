'use client';

import { DatePicker } from '../../components/ui/date-picker';
import { EntitySelect } from '../../components/ui/entity-select';
import { FilterBar } from '../../components/ui/filter-bar';
import { FormField } from '../../components/ui/form-field';
import { listFleets, listVehicles } from '../../lib/api/fleet.api';

// Fase 41 -- bloco de filtro (período/veículo/frota) usado por todas as
// páginas de gestão da frota, extraído do que antes era duplicado
// verbatim em cada page.tsx (Fase 40). Estado controlado pelo chamador via
// useFleetOperationsFilters.
export function FleetFilters({
  idPrefix,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  vehicleId,
  onVehicleIdChange,
  fleetId,
  onFleetIdChange,
  hasActiveFilters,
  onClear,
}: {
  idPrefix: string;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  vehicleId: string;
  onVehicleIdChange: (value: string) => void;
  fleetId: string;
  onFleetIdChange: (value: string) => void;
  hasActiveFilters: boolean;
  onClear: () => void;
}): JSX.Element {
  return (
    <FilterBar hasActiveFilters={hasActiveFilters} onClear={onClear}>
      <FormField label="De" htmlFor={`${idPrefix}-start`}>
        <DatePicker id={`${idPrefix}-start`} value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
      </FormField>
      <FormField label="Até" htmlFor={`${idPrefix}-end`}>
        <DatePicker id={`${idPrefix}-end`} value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
      </FormField>
      <FormField label="Veículo" htmlFor={`${idPrefix}-vehicle`} className="w-full sm:w-48">
        <EntitySelect
          id={`${idPrefix}-vehicle`}
          queryKey={['vehicles', 'select']}
          queryFn={() => listVehicles({ pageSize: 100 })}
          getOptionValue={(v) => v.id}
          getOptionLabel={(v) => v.plate}
          value={vehicleId}
          onChange={onVehicleIdChange}
          placeholder="Todos"
        />
      </FormField>
      <FormField label="Frota" htmlFor={`${idPrefix}-fleet`} className="w-full sm:w-48">
        <EntitySelect
          id={`${idPrefix}-fleet`}
          queryKey={['fleets', 'select']}
          queryFn={() => listFleets({ pageSize: 100 })}
          getOptionValue={(f) => f.id}
          getOptionLabel={(f) => f.name}
          value={fleetId}
          onChange={onFleetIdChange}
          placeholder="Todas"
        />
      </FormField>
    </FilterBar>
  );
}
