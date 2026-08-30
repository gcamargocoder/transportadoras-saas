import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import * as driverTripsApi from '../api/driverTrips.api';
import { TripDeliveryStop, TripDeliveryStopStatus } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryStops'>;

const STATUS_LABELS: Record<TripDeliveryStopStatus, string> = {
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluida',
  CANCELLED: 'Cancelada',
  FAILED: 'Falhou',
};

const STATUS_COLORS: Record<TripDeliveryStopStatus, string> = {
  PENDING: colors.textMuted,
  IN_PROGRESS: colors.primary,
  COMPLETED: colors.success,
  CANCELLED: colors.textMuted,
  FAILED: colors.danger,
};

function stopLabel(stop: TripDeliveryStop): string {
  return `${stop.sequence}. ${stop.locationName}`;
}

// Fase 106 -- paradas/entregas PLANEJADAS (TripDeliveryStop, Fase 88): ate
// aqui o Driver App so LIA esta lista (nenhuma tela a exibia); a mudanca de
// status era exclusiva do painel administrativo, criando um furo real --
// o motorista concluia a entrega em campo mas o sistema so sabia disso se
// alguem no escritorio atualizasse manualmente. Esta tela fecha essa lacuna
// reaproveitando o MESMO servico/regra de transicao do admin (PATCH
// /driver/trips/:id/delivery-stops/:stopId/status -> TripDeliveryStopsService.
// updateStatus, identico ao endpoint administrativo) via a MESMA fila
// offline (syncQueue, kind 'delivery-stop-status') -- nenhum mecanismo novo.
export function DeliveryStopsScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId } = route.params;
  const [loading, setLoading] = useState(true);
  const [stops, setStops] = useState<TripDeliveryStop[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failingId, setFailingId] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await driverTripsApi.getDeliveryStops(tripId).catch(() => [] as TripDeliveryStop[]);
      setStops(list);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applyStatus(stopId: string, status: TripDeliveryStopStatus, reason?: string): Promise<void> {
    setBusyId(stopId);
    setFeedback(null);
    try {
      const result = await submitOrQueue({
        kind: 'delivery-stop-status',
        tripId,
        stopId,
        status,
        ...(reason ? { reason } : {}),
      });
      if (result.queued) {
        setFeedback('Sem conexao agora -- sera sincronizado automaticamente assim que possivel.');
        // Sem rede, um novo GET aqui retornaria a lista antiga (ou vazia, se
        // a falha for de conectividade) -- pior do que refletir a INTENCAO
        // que o motorista acabou de expressar. Atualizacao local, nunca
        // persistida (perdida ao sair da tela) -- a fila offline e SEMPRE a
        // fonte de verdade real ate confirmar com o servidor.
        setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, status } : s)));
      } else {
        setFeedback(null);
        // Confirmado pelo servidor -- recarrega para trazer campos derivados
        // (actualArrival/deliveredAt) que a atualizacao local nao calcula.
        await load();
      }
      setFailingId(null);
      setFailureReason('');
    } finally {
      setBusyId(null);
    }
  }

  function confirmFailure(stopId: string): void {
    if (!failureReason.trim()) return;
    void applyStatus(stopId, 'FAILED', failureReason.trim());
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>Entregas</Text>

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
              <Text style={{ color: colors.text, fontWeight: '700' }}>{stopLabel(item)}</Text>
              {item.customerName && <Text style={{ color: colors.textMuted }}>{item.customerName}</Text>}
              {item.locationAddress && <Text style={{ color: colors.textMuted }}>{item.locationAddress}</Text>}
              <Text style={{ color: STATUS_COLORS[item.status], fontWeight: '600' }}>
                {STATUS_LABELS[item.status]}
              </Text>
              {item.failureReason && (
                <Text style={{ color: colors.danger }}>Motivo: {item.failureReason}</Text>
              )}

              {item.status === 'PENDING' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="INICIAR ENTREGA"
                      loading={busyId === item.id}
                      onPress={() => applyStatus(item.id, 'IN_PROGRESS')}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Falha"
                      variant="danger"
                      disabled={busyId === item.id}
                      onPress={() => setFailingId(item.id)}
                    />
                  </View>
                </View>
              )}

              {item.status === 'IN_PROGRESS' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="CONCLUIR ENTREGA"
                      loading={busyId === item.id}
                      onPress={() => applyStatus(item.id, 'COMPLETED')}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Falha"
                      variant="danger"
                      disabled={busyId === item.id}
                      onPress={() => setFailingId(item.id)}
                    />
                  </View>
                </View>
              )}

              {failingId === item.id && (
                <View style={{ marginTop: 8, gap: 8 }}>
                  <TextField
                    label="Motivo da falha"
                    value={failureReason}
                    onChangeText={setFailureReason}
                    placeholder="Ex: endereco nao encontrado"
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="CONFIRMAR FALHA"
                        variant="danger"
                        loading={busyId === item.id}
                        disabled={!failureReason.trim()}
                        onPress={() => confirmFailure(item.id)}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Cancelar"
                        variant="secondary"
                        onPress={() => {
                          setFailingId(null);
                          setFailureReason('');
                        }}
                      />
                    </View>
                  </View>
                </View>
              )}

              {item.status === 'COMPLETED' && (
                <View style={{ marginTop: 8 }}>
                  <Button
                    label="Anexar comprovante"
                    variant="secondary"
                    onPress={() =>
                      navigation.navigate('DeliveryProof', {
                        tripId,
                        tripDeliveryStopId: item.id,
                        stopLabel: stopLabel(item),
                      })
                    }
                  />
                </View>
              )}
            </Card>
          )}
          ListEmptyComponent={
            <Text style={{ color: colors.textMuted }}>Nenhuma entrega planejada para esta viagem.</Text>
          }
        />
      )}

      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}
