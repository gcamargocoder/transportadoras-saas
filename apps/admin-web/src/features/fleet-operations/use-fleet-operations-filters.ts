import { useState } from 'react';
import type { FleetOperationsQuery } from '../../lib/api/fleet-operations.api';

// Fase 41 -- contrato de filtro compartilhado (período/veículo/frota) pelas
// 4+ páginas de gestão da frota, evitando mecanismos incompatíveis entre
// telas (secao N do pedido). Aplicado sempre no backend via FleetOperationsQuery
// -- nunca carrega tudo para filtrar no cliente.
export function useFleetOperationsFilters() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [fleetId, setFleetId] = useState('');

  const filters: FleetOperationsQuery = {
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    vehicleId: vehicleId || undefined,
    fleetId: fleetId || undefined,
  };

  const hasActiveFilters = Boolean(startDate || endDate || vehicleId || fleetId);

  function clear(): void {
    setStartDate('');
    setEndDate('');
    setVehicleId('');
    setFleetId('');
  }

  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    vehicleId,
    setVehicleId,
    fleetId,
    setFleetId,
    filters,
    hasActiveFilters,
    clear,
  };
}
