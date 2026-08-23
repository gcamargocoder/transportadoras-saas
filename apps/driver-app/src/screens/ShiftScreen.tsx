import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverShift } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Shift'>;

// Fase 67 -- controle de jornada do motorista (inicio/pausa/retorno/
// encerramento). 'shift-start' e sempre tentado ONLINE (nao entra na fila
// offline -- mesmo motivo estrutural da criacao de checklist em
// syncQueue.ts: as acoes seguintes precisam do id gerado pelo servidor, que
// a fila nao resolve encadeado). Uma vez com o id em maos, pausa/retorno/
// encerramento/cancelamento reaproveitam a MESMA fila offline (idempotentes
// por ESTADO no backend, nunca duplicam).
export function ShiftScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId } = route.params;
  const [loading, setLoading] = useState(true);
  const [shift, setShift] = useState<DriverShift | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const active = await driverTripsApi.getActiveShift().catch(() => null);
      setShift(active);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStart(): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const created = await driverTripsApi.startShift(tripId);
      setShift(created);
    } catch {
      setFeedback('Sem conexão agora -- tente iniciar a jornada novamente em instantes.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePause(): Promise<void> {
    if (!shift) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await submitOrQueue({ kind: 'shift-break-start', shiftId: shift.id });
      setFeedback(result.queued ? 'Sem conexão agora -- a pausa será enviada automaticamente.' : null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleResume(): Promise<void> {
    if (!shift) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await submitOrQueue({ kind: 'shift-break-end', shiftId: shift.id });
      setFeedback(result.queued ? 'Sem conexão agora -- o retorno será enviado automaticamente.' : null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd(): Promise<void> {
    if (!shift) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await submitOrQueue({ kind: 'shift-end', shiftId: shift.id });
      setFeedback(result.queued ? 'Sem conexão agora -- o encerramento será enviado automaticamente.' : null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const openBreak = shift?.breaks.find((b) => !b.endedAt) ?? null;

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>Jornada</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : !shift || shift.status !== 'OPEN' ? (
        <Card>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Nenhuma jornada em andamento</Text>
          <Button label="INICIAR JORNADA" loading={busy} onPress={handleStart} />
        </Card>
      ) : (
        <Card>
          <Text style={{ color: colors.text, fontWeight: '700' }}>
            {openBreak ? 'Jornada em pausa' : 'Jornada em andamento'}
          </Text>
          <Text style={{ color: colors.textMuted }}>Início: {new Date(shift.startedAt).toLocaleString()}</Text>
          {openBreak ? (
            <Button label="RETOMAR" loading={busy} onPress={handleResume} />
          ) : (
            <Button label="PAUSAR" variant="secondary" loading={busy} onPress={handlePause} />
          )}
          <Button label="ENCERRAR JORNADA" variant="danger" loading={busy} onPress={handleEnd} />
        </Card>
      )}

      {feedback ? <Text style={{ color: colors.textMuted }}>{feedback}</Text> : null}

      {shift && shift.breaks.length > 0 && (
        <FlatList
          data={shift.breaks}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ gap: 10, marginTop: 12 }}
          renderItem={({ item }) => (
            <Card>
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                Pausa · {new Date(item.startedAt).toLocaleString()}
              </Text>
              <Text style={{ color: colors.textMuted }}>
                {item.endedAt ? `Duração: ${item.durationMinutes ?? '-'} min` : 'Em andamento'}
              </Text>
            </Card>
          )}
        />
      )}

      <View style={{ height: 12 }} />
      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}
