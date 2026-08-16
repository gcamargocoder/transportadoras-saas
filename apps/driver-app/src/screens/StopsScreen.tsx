import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as driverTripsApi from '../api/driverTrips.api';
import { TripStop, TripStopType } from '../api/driverTrips.types';
import {
  clearActiveStopPointer,
  getActiveStopPointer,
  setActiveStopPointer,
} from '../storage/activeStopPointer';
import { generateDeviceEventId } from '../storage/deviceEventId';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Stops'>;

// Fase 43 -- catalogo completo (espelha TripStopType do backend), com os
// motivos mais comuns em destaque no topo da grade -- 1 toque seleciona o
// motivo E ja abre a parada (nunca um formulario com varios campos).
const STOP_TYPE_LABELS: Record<TripStopType, string> = {
  UNKNOWN: 'Nao classificada',
  FUEL: 'Abastecimento',
  REST: 'Descanso',
  MEAL: 'Refeicao',
  MAINTENANCE: 'Manutencao',
  OTHER: 'Outro',
  LOADING: 'Carregando',
  UNLOADING: 'Descarregando',
  WAITING_LOADING: 'Aguard. carga',
  WAITING_UNLOADING: 'Aguard. descarga',
  YARD: 'Patio',
  CUSTOMER: 'Cliente',
  GARAGE: 'Garagem',
  BREAKDOWN: 'Quebra',
  TIRE: 'Pneu',
  CONGESTION: 'Congestionamento',
  ACCIDENT: 'Acidente',
  ROAD_CLOSURE: 'Interdicao',
  INSPECTION: 'Fiscalizacao',
  PERSONAL_NEED: 'Necessidade pessoal',
  DOCUMENTATION: 'Documentacao',
  WAITING_AUTHORIZATION: 'Aguard. autorizacao',
};

const QUICK_STOP_TYPES: TripStopType[] = [
  'LOADING',
  'UNLOADING',
  'WAITING_LOADING',
  'WAITING_UNLOADING',
  'FUEL',
  'REST',
  'MEAL',
  'MAINTENANCE',
  'BREAKDOWN',
  'YARD',
  'CUSTOMER',
  'GARAGE',
  'CONGESTION',
  'INSPECTION',
  'DOCUMENTATION',
  'OTHER',
];

interface OpenStopInfo {
  deviceEventId: string;
  type: TripStopType;
  startedAt: string;
}

// Lista de paradas da viagem (Fase 25, secao 7; Fase 43, secao 10) -- o
// motorista abre uma parada com 1 toque (motivo + abertura no mesmo gesto)
// e encerra com outro. Funciona offline: abertura e fechamento passam pela
// MESMA fila offline (syncQueue.ts, kinds 'stop-open'/'stop-close') usada
// pelo resto do app -- o fechamento identifica a parada pelo deviceEventId
// gerado na abertura (nunca pelo id do servidor, que pode nao existir
// ainda se a abertura tambem estiver pendente de sincronizacao).
export function StopsScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId } = route.params;
  const [loading, setLoading] = useState(true);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [openStop, setOpenStop] = useState<OpenStopInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, pointer] = await Promise.all([
        driverTripsApi.getStops(tripId).catch(() => [] as TripStop[]),
        getActiveStopPointer(tripId),
      ]);
      setStops(list);
      // O servidor so sabe de paradas ja sincronizadas -- se a abertura
      // ainda esta na fila offline, o ponteiro local e a UNICA fonte de
      // verdade de que ha uma parada em aberto (secao 33 do pedido: app
      // reiniciar/reabrir sem perder o estado).
      const openFromServer = list.find((s) => !s.endedAt);
      if (openFromServer) {
        setOpenStop({ deviceEventId: pointer?.deviceEventId ?? openFromServer.id, type: openFromServer.type, startedAt: openFromServer.startedAt });
      } else if (pointer) {
        setOpenStop({ deviceEventId: pointer.deviceEventId, type: pointer.type, startedAt: pointer.startedAt });
      } else {
        setOpenStop(null);
      }
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleOpen(type: TripStopType): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const deviceEventId = generateDeviceEventId();
      const startedAt = new Date().toISOString();
      const position = await Location.getLastKnownPositionAsync().catch(() => null);

      const result = await submitOrQueue({
        kind: 'stop-open',
        tripId,
        deviceEventId,
        type,
        latitude: position?.coords.latitude ?? 0,
        longitude: position?.coords.longitude ?? 0,
        startedAt,
      });

      await setActiveStopPointer({ tripId, deviceEventId, type, startedAt });
      setOpenStop({ deviceEventId, type, startedAt });
      setFeedback(result.queued ? 'Sem conexao agora -- a abertura sera enviada automaticamente.' : null);
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(): Promise<void> {
    if (!openStop) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await submitOrQueue({
        kind: 'stop-close',
        tripId,
        deviceEventId: openStop.deviceEventId,
        endedAt: new Date().toISOString(),
      });
      await clearActiveStopPointer(tripId);
      setOpenStop(null);
      setFeedback(result.queued ? 'Sem conexao agora -- o encerramento sera enviado automaticamente.' : null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>Paradas</Text>

      {openStop ? (
        <Card>
          <Text style={{ color: colors.text, fontWeight: '700' }}>
            Parada em andamento: {STOP_TYPE_LABELS[openStop.type] ?? openStop.type}
          </Text>
          <Text style={{ color: colors.textMuted }}>Inicio: {new Date(openStop.startedAt).toLocaleString()}</Text>
          <Button label="ENCERRAR PARADA" variant="danger" loading={busy} onPress={handleClose} />
        </Card>
      ) : (
        <Card>
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Motivo da parada</Text>
          <View style={styles.grid}>
            {QUICK_STOP_TYPES.map((type) => (
              <Pressable
                key={type}
                disabled={busy}
                onPress={() => handleOpen(type)}
                style={({ pressed }) => [styles.chip, { opacity: busy ? 0.6 : pressed ? 0.8 : 1 }]}
              >
                <Text style={styles.chipLabel}>{STOP_TYPE_LABELS[type]}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      )}

      {feedback ? <Text style={{ color: colors.textMuted }}>{feedback}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={stops}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ gap: 10 }}
          renderItem={({ item }) => (
            <Card>
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                {STOP_TYPE_LABELS[item.type] ?? item.type}
              </Text>
              <Text style={{ color: colors.textMuted }}>Inicio: {new Date(item.startedAt).toLocaleString()}</Text>
              <Text style={{ color: colors.textMuted }}>
                {item.endedAt ? `Duracao: ${item.durationMinutes ?? '-'} min` : 'Em andamento'}
              </Text>
            </Card>
          )}
          ListEmptyComponent={<Text style={{ color: colors.textMuted }}>Nenhuma parada registrada.</Text>}
        />
      )}

      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
