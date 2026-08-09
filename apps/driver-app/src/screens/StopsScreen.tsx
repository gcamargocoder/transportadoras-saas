import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as driverTripsApi from '../api/driverTrips.api';
import { TripStop } from '../api/driverTrips.types';
import { generateDeviceEventId } from '../storage/deviceEventId';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Stops'>;

const STOP_TYPE_LABELS: Record<string, string> = {
  UNKNOWN: 'Nao classificada',
  FUEL: 'Abastecimento',
  REST: 'Descanso',
  MEAL: 'Refeicao',
  MAINTENANCE: 'Manutencao',
  OTHER: 'Outro',
};

// Lista de paradas da viagem (Fase 25, secao 7) -- a maioria e detectada
// automaticamente (ver useLocationTracker), mas o motorista tambem pode
// abrir/fechar uma parada manualmente aqui (ex: para classificar antes da
// deteccao automatica reagir).
export function StopsScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId } = route.params;
  const [loading, setLoading] = useState(true);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [openStopId, setOpenStopId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await driverTripsApi.getStops(tripId);
      setStops(list);
      const open = list.find((s) => !s.endedAt);
      setOpenStopId(open?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleOpen(): Promise<void> {
    setBusy(true);
    try {
      const position = await Location.getLastKnownPositionAsync().catch(() => null);
      const stop = await driverTripsApi.openStop(tripId, {
        deviceEventId: generateDeviceEventId(),
        latitude: position?.coords.latitude ?? 0,
        longitude: position?.coords.longitude ?? 0,
        startedAt: new Date().toISOString(),
      });
      setOpenStopId(stop.id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(): Promise<void> {
    if (!openStopId) return;
    setBusy(true);
    try {
      await driverTripsApi.closeStop(tripId, openStopId, { endedAt: new Date().toISOString() });
      setOpenStopId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>
        Paradas
      </Text>

      <Button
        label={openStopId ? 'ENCERRAR PARADA' : 'REGISTRAR PARADA'}
        variant={openStopId ? 'danger' : 'primary'}
        loading={busy}
        onPress={openStopId ? handleClose : handleOpen}
      />

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
              <Text style={{ color: colors.textMuted }}>
                Inicio: {new Date(item.startedAt).toLocaleString()}
              </Text>
              <Text style={{ color: colors.textMuted }}>
                {item.endedAt
                  ? `Duracao: ${item.durationMinutes ?? '-'} min`
                  : 'Em andamento'}
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
