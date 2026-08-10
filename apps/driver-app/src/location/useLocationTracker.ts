import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverConfig } from '../api/driverTrips.types';
import { generateDeviceEventId } from '../storage/deviceEventId';
import { submitOrQueue } from '../storage/syncQueue';
import { compact } from '../utils/compact';
import { haversineDistanceMeters } from './geo';

export type LocationPermissionStatus = 'unknown' | 'granted' | 'denied';

interface OpenAutoStop {
  id: string;
  startedAt: string;
  originLatitude: number;
  originLongitude: number;
}

// Camada de localizacao do app do motorista (Fase 25, secoes 3 e 6). So
// foreground nesta fase (app aberto) -- background fica preparado para o
// futuro (ver app.json: isAndroidBackgroundLocationEnabled=false). Resiliente
// a perda de sinal: o watch simplesmente para de emitir, a ULTIMA posicao
// conhecida permanece valida ate a proxima leitura -- nunca inventa uma
// posicao.
//
// Tambem executa a deteccao de parada (secao 6): compara cada nova posicao
// com a origem do "cluster parado" atual; se o veiculo permanecer dentro de
// stopRadiusMeters por mais de stopDetectionMinutes, abre uma TripStop
// automaticamente (tipo UNKNOWN, reclassificavel depois). Ao voltar a se
// mover, fecha a parada. Abertura offline (sem resposta imediata do
// servidor) fica enfileirada mas nao pode ser fechada automaticamente sem o
// id gerado pelo servidor -- limite conhecido, documentado no relatorio
// final (nao se justifica um mecanismo de sincronizacao mais complexo so
// para este caso nesta fase).
export function useLocationTracker(
  tripId: string | null,
  config: DriverConfig | null,
): { status: LocationPermissionStatus; lastKnown: Location.LocationObject | null } {
  const [status, setStatus] = useState<LocationPermissionStatus>('unknown');
  const [lastKnown, setLastKnown] = useState<Location.LocationObject | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const openStopRef = useRef<OpenAutoStop | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function handlePosition(position: Location.LocationObject): Promise<void> {
      setLastKnown(position);

      void submitOrQueue({
        kind: 'locations',
        tripId: tripId!,
        points: [
          compact({
            deviceEventId: generateDeviceEventId(),
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            speedKmh: position.coords.speed != null ? position.coords.speed * 3.6 : undefined,
            headingDeg: position.coords.heading ?? undefined,
            recordedAt: new Date(position.timestamp).toISOString(),
          }) as { deviceEventId: string; latitude: number; longitude: number; recordedAt: string },
        ],
      });

      if (!config) return;
      const here = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const open = openStopRef.current;

      if (!open) {
        openStopRef.current = {
          id: '__pending__',
          startedAt: new Date(position.timestamp).toISOString(),
          originLatitude: here.latitude,
          originLongitude: here.longitude,
        };
        return;
      }

      const distance = haversineDistanceMeters(
        { latitude: open.originLatitude, longitude: open.originLongitude },
        here,
      );

      if (distance > config.stopRadiusMeters) {
        // Voltou a se mover -- fecha a parada se ela chegou a ser criada de
        // fato no servidor (id real, nao o placeholder local).
        if (open.id !== '__pending__' && open.id !== '__open__') {
          void driverTripsApi
            .closeStop(tripId!, open.id, { endedAt: new Date().toISOString() })
            .catch(() => undefined);
        }
        openStopRef.current = {
          id: '__pending__',
          startedAt: new Date(position.timestamp).toISOString(),
          originLatitude: here.latitude,
          originLongitude: here.longitude,
        };
        return;
      }

      if (open.id !== '__pending__') return; // ja aberta (ou tentativa em curso)

      const elapsedMinutes = (Date.now() - new Date(open.startedAt).getTime()) / 60_000;
      if (elapsedMinutes < config.stopDetectionMinutes) return;

      openStopRef.current = { ...open, id: '__open__' };
      try {
        const stop = await driverTripsApi.openStop(tripId!, {
          deviceEventId: generateDeviceEventId(),
          latitude: here.latitude,
          longitude: here.longitude,
          startedAt: open.startedAt,
        });
        if (openStopRef.current?.id === '__open__') {
          openStopRef.current = { ...open, id: stop.id };
        }
      } catch {
        // Sem rede -- mantem "__pending__" para tentar de novo na proxima
        // leitura (nao usa a fila offline aqui porque precisamos do id de
        // volta para poder fechar a parada depois).
        openStopRef.current = { ...open, id: '__pending__' };
      }
    }

    async function start(): Promise<void> {
      if (!tripId) return;

      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }
      setStatus('granted');

      // Fase 32, Parte A -- watchPositionAsync e assincrono; se o efeito for
      // limpo (unmount/troca de tripId) ENQUANTO esta chamada ainda esta
      // pendente, a cleanup ja rodou (cancelled=true) e nao vai rodar de novo
      // para este subscription especifico. Sem este segundo check, a
      // subscription resolvida tardiamente ficava "vazada" (nunca removida,
      // ref sobrescrita). Confirmado por teste (useLocationTracker.test.ts,
      // "condicao de corrida").
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: Math.max(config?.gpsPingIntervalSeconds ?? 30, 10) * 1000,
          distanceInterval: 50,
        },
        (position) => {
          void handlePosition(position);
        },
      );
      if (cancelled) {
        subscription.remove();
        return;
      }
      subscriptionRef.current = subscription;
    }

    void start();

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      openStopRef.current = null;
    };
  }, [tripId, config?.gpsPingIntervalSeconds, config?.stopDetectionMinutes, config?.stopRadiusMeters]);

  return { status, lastKnown };
}
