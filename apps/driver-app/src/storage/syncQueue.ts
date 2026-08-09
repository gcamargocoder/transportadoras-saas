import AsyncStorage from '@react-native-async-storage/async-storage';
import * as driverTripsApi from '../api/driverTrips.api';
import { AxleEventSource, TrackingPointInput } from '../api/driverTrips.types';
import { compact } from '../utils/compact';

// Fila offline (Fase 25, secao 17/18) -- eventos de CRIACAO gerados pelo app
// (localizacao, abertura de parada, abastecimento, abertura de excecao de
// eixo) sao sempre tentados imediatamente; se a rede falhar, ficam aqui ate a
// proxima chamada a flush() (reconexao). Idempotentes por deviceEventId no
// backend -- reenviar nunca duplica. Fechamento de parada/eixo (que
// depende do id gerado pelo servidor na abertura) fica fora desta fila por
// simplicidade nesta fase -- ver comentario em close().
type PendingAction =
  | { kind: 'locations'; tripId: string; points: TrackingPointInput[] }
  | {
      kind: 'stop-open';
      tripId: string;
      deviceEventId: string;
      latitude: number;
      longitude: number;
      startedAt: string;
    }
  | {
      kind: 'fuel-supply';
      tripId: string;
      deviceEventId: string;
      odometerKm: number;
      liters: number;
      latitude?: number;
      longitude?: number;
    }
  | {
      kind: 'axle-event-open';
      tripId: string;
      deviceEventId: string;
      tollPlazaId?: string;
      declaredAxles?: number;
      source: AxleEventSource;
      latitude: number;
      longitude: number;
    };

const STORAGE_KEY = 'driverapp.syncQueue';

async function readQueue(): Promise<PendingAction[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingAction[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingAction[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

async function runAction(action: PendingAction): Promise<void> {
  switch (action.kind) {
    case 'locations':
      await driverTripsApi.sendLocations(action.tripId, action.points);
      return;
    case 'stop-open':
      await driverTripsApi.openStop(action.tripId, {
        deviceEventId: action.deviceEventId,
        latitude: action.latitude,
        longitude: action.longitude,
        startedAt: action.startedAt,
      });
      return;
    case 'fuel-supply':
      await driverTripsApi.createFuelSupply(action.tripId, {
        deviceEventId: action.deviceEventId,
        odometerKm: action.odometerKm,
        liters: action.liters,
        ...compact({ latitude: action.latitude, longitude: action.longitude }),
      });
      return;
    case 'axle-event-open':
      await driverTripsApi.openAxleEvent(action.tripId, {
        deviceEventId: action.deviceEventId,
        source: action.source,
        latitude: action.latitude,
        longitude: action.longitude,
        ...compact({ tollPlazaId: action.tollPlazaId, declaredAxles: action.declaredAxles }),
      });
      return;
  }
}

// Tenta executar a acao AGORA; se falhar (rede indisponivel), enfileira para
// tentar de novo depois -- nunca lanca para o chamador, o registro sempre
// "parece" ter sido aceito do ponto de vista do motorista (offline-first).
export async function submitOrQueue(action: PendingAction): Promise<{ queued: boolean }> {
  try {
    await runAction(action);
    return { queued: false };
  } catch {
    const queue = await readQueue();
    queue.push(action);
    await writeQueue(queue);
    return { queued: true };
  }
}

// Chamado ao reabrir o app / recuperar conectividade -- tenta reenviar tudo
// que ficou pendente, na ordem em que foi criado. Para no primeiro erro
// (provavelmente ainda sem rede) para nao reordenar eventos.
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  const queue = await readQueue();
  let sent = 0;
  while (queue.length > 0) {
    const next = queue[0]!;
    try {
      await runAction(next);
      queue.shift();
      sent += 1;
    } catch {
      break;
    }
  }
  await writeQueue(queue);
  return { sent, remaining: queue.length };
}

export async function pendingCount(): Promise<number> {
  return (await readQueue()).length;
}
