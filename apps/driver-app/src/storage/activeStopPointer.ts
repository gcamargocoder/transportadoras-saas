import AsyncStorage from '@react-native-async-storage/async-storage';
import { TripStopType } from '../api/driverTrips.types';

// Fase 43 -- ponteiro leve para recuperar uma parada aberta apos o app
// fechar/reabrir, mesmo principio de checklistPointer.ts (Fase 39): guarda
// so o essencial, nunca reconstroi estado a partir do zero. Necessario
// aqui porque a abertura pode ainda estar na fila offline (sem id do
// servidor) -- o deviceEventId gerado na abertura e a UNICA referencia
// estavel para fechar depois (POST stops/close-by-device-event), online ou
// nao. A fonte de verdade de paradas JA sincronizadas continua sendo o
// servidor (GET driver/trips/:id/stops).
export interface ActiveStopPointer {
  tripId: string;
  deviceEventId: string;
  type: TripStopType;
  startedAt: string;
}

function storageKey(tripId: string): string {
  return `driverapp.activeStop.${tripId}`;
}

export async function getActiveStopPointer(tripId: string): Promise<ActiveStopPointer | null> {
  const raw = await AsyncStorage.getItem(storageKey(tripId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveStopPointer;
  } catch {
    return null;
  }
}

export async function setActiveStopPointer(pointer: ActiveStopPointer): Promise<void> {
  await AsyncStorage.setItem(storageKey(pointer.tripId), JSON.stringify(pointer));
}

export async function clearActiveStopPointer(tripId: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(tripId));
}
