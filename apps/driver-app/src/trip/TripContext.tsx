import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as driverTripsApi from '../api/driverTrips.api';
import { flushQueue } from '../storage/syncQueue';
import { DriverActiveTrip, DriverConfig } from '../api/driverTrips.types';

interface TripState {
  isLoading: boolean;
  activeTrip: DriverActiveTrip | null;
  config: DriverConfig | null;
  refresh: () => Promise<void>;
}

const TripContext = createContext<TripState | null>(null);

// Unica fonte de verdade da viagem em andamento (Fase 25, secao 2) -- lida do
// backend a cada refresh(), nunca guarda estado "otimista" de status entre
// sessoes. Tambem tenta sincronizar a fila offline a cada refresh (ex: ao
// reabrir o app / puxar para atualizar).
export function TripProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [activeTrip, setActiveTrip] = useState<DriverActiveTrip | null>(null);
  const [config, setConfig] = useState<DriverConfig | null>(null);

  const refresh = useCallback(async () => {
    await flushQueue().catch(() => undefined);
    const [trip, cfg] = await Promise.all([
      driverTripsApi.getActiveTrip().catch(() => null),
      driverTripsApi.getConfig().catch(() => null),
    ]);
    setActiveTrip(trip);
    if (cfg) setConfig(cfg);
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  const value = useMemo<TripState>(
    () => ({ isLoading, activeTrip, config, refresh }),
    [isLoading, activeTrip, config, refresh],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripState {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip precisa estar dentro de TripProvider.');
  return ctx;
}
