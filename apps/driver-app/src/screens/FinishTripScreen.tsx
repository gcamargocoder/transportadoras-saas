import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverTrip, VehicleIdleReason } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'FinishTrip'>;

// Fase C -- motivo OPCIONAL da parada do veiculo APOS esta viagem. Vai junto
// na acao 'complete' e e aplicado ao VehicleIdlePeriod que o backend abre ao
// concluir (Fase B) -- nunca cria um 2o periodo, nunca informa duracao. O
// motorista NUNCA e obrigado a escolher: sem selecao, fica o default
// automatico (e ele pode informar/alterar depois pela Home).
const IDLE_REASON_LABELS: Record<VehicleIdleReason, string> = {
  AGUARDANDO_CARGA: 'Aguardando carga',
  AGUARDANDO_ORDEM: 'Aguardando ordem',
  MANUTENCAO: 'Manutenção',
  DOCUMENTACAO: 'Documentação',
  DESCANSO: 'Descanso',
  PATIO: 'Pátio',
  OUTRO: 'Outro',
};
const IDLE_REASONS = Object.keys(IDLE_REASON_LABELS) as VehicleIdleReason[];

// Tela "FINALIZAR VIAGEM" (Fase 28, secao 11) -- unico campo obrigatorio: KM
// final. Nao pede nada que o sistema ja saiba (destino, veiculo). A posicao
// GPS (quando disponivel) e enviada junto, mas nunca bloqueia o encerramento.
// Fase 30, secao 10/11 -- o formulario NUNCA fica bloqueado esperando
// GET /driver/trips/:id (so exibido como contexto, quando disponivel): sem
// conexao para carregar a viagem, o motorista ainda consegue informar o KM e
// finalizar (enfileirado via submitOrQueue, mesma fila de sempre).
export function FinishTripScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId } = route.params;
  const [trip, setTrip] = useState<DriverTrip | null>(null);
  const [odometerKm, setOdometerKm] = useState('');
  const [idleReason, setIdleReason] = useState<VehicleIdleReason | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    driverTripsApi.getTrip(tripId).then(setTrip).catch(() => undefined);
  }, [tripId]);

  const parsedOdometer = Number(odometerKm.replace(',', '.'));
  const canSubmit = Number.isFinite(parsedOdometer) && parsedOdometer > 0;

  async function handleFinish(): Promise<void> {
    if (!canSubmit) {
      setFeedback('Informe o KM final da viagem.');
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      const position = await Location.getLastKnownPositionAsync().catch(() => null);
      const result = await submitOrQueue({
        kind: 'complete',
        tripId,
        finalOdometerKm: parsedOdometer,
        ...(idleReason ? { idleReason } : {}),
        ...(position
          ? { latitude: position.coords.latitude, longitude: position.coords.longitude }
          : {}),
      });
      if (result.queued) {
        setFeedback('Sem conexao agora -- a viagem sera finalizada automaticamente assim que possivel.');
      }
      navigation.replace('Home');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>
        Finalizar viagem
      </Text>

      {trip && (
        <Card>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Destino</Text>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {trip.destinationName}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>KM atual</Text>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {trip.currentOdometerKm !== null ? `${trip.currentOdometerKm} km` : '-'}
          </Text>
        </Card>
      )}

      <TextField
        label="KM final"
        value={odometerKm}
        onChangeText={setOdometerKm}
        keyboardType="numeric"
      />

      <Card>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>
          Motivo da parada do veiculo (opcional)
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
          Ao encerrar, o veiculo fica parado ate a proxima viagem. Voce pode informar o motivo agora
          ou depois, pela tela inicial.
        </Text>
        <View style={styles.reasonGrid}>
          {IDLE_REASONS.map((r) => (
            <Pressable
              key={r}
              disabled={submitting}
              onPress={() => setIdleReason((prev) => (prev === r ? null : r))}
              style={({ pressed }) => [
                styles.reasonChip,
                idleReason === r && styles.reasonChipSelected,
                { opacity: submitting ? 0.6 : pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.reasonChipLabel, idleReason === r && styles.reasonChipLabelSelected]}>
                {IDLE_REASON_LABELS[r]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {feedback ? <Text style={{ color: colors.textMuted }}>{feedback}</Text> : null}

      <Button label="FINALIZAR VIAGEM" onPress={handleFinish} loading={submitting} disabled={!canSubmit} />
      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: { backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 },
  reasonChipSelected: { backgroundColor: colors.primary },
  reasonChipLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  reasonChipLabelSelected: { color: colors.background },
});
