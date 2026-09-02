import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverIdlePeriod, VehicleIdleReason } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'IdleReason'>;

// Fase C -- tela pos-viagem "Finalizar operacao". O veiculo JA esta parado
// (a Fase B abriu o VehicleIdlePeriod ao concluir a viagem). Aqui o
// motorista so CONFIRMA/ALTERA o MOTIVO -- nunca cria periodo, nunca informa
// duracao/datas (tudo do backend). Motivo e OPCIONAL: cancelar mantem o
// default automatico.
const REASON_LABELS: Record<VehicleIdleReason, string> = {
  AGUARDANDO_CARGA: 'Aguardando carga',
  AGUARDANDO_ORDEM: 'Aguardando ordem',
  MANUTENCAO: 'Manutenção',
  DOCUMENTACAO: 'Documentação',
  DESCANSO: 'Descanso',
  PATIO: 'Pátio',
  OUTRO: 'Outro',
};
const REASONS = Object.keys(REASON_LABELS) as VehicleIdleReason[];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR');
}

export function IdleReasonScreen({ navigation }: Props): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<DriverIdlePeriod | null>(null);
  const [reason, setReason] = useState<VehicleIdleReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    driverTripsApi
      .getCurrentIdlePeriod()
      .then((result) => {
        if (cancelled) return;
        setPeriod(result);
        setReason(result?.reason ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConfirm(): Promise<void> {
    if (!reason) {
      setFeedback('Selecione um motivo para confirmar.');
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      // NUNCA envia duracao/datas -- so o motivo. Idempotente por estado.
      const result = await submitOrQueue({ kind: 'idle-reason', reason });
      setFeedback(
        result.queued
          ? 'Sem conexão agora -- o motivo será enviado automaticamente assim que possível.'
          : 'Motivo registrado.',
      );
      navigation.replace('Home');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>
        Finalizar operação
      </Text>

      {period ? (
        <>
          <Card>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Veículo</Text>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              {period.plate ?? '-'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Parado desde</Text>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              {formatDateTime(period.startedAt)}
            </Text>
            {period.previousDestinationLabel ? (
              <>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Último destino</Text>
                <Text style={{ color: colors.text, fontSize: 16 }}>{period.previousDestinationLabel}</Text>
              </>
            ) : null}
          </Card>

          <Card>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>
              Por que o veículo está parado?
            </Text>
            <View style={styles.grid}>
              {REASONS.map((r) => (
                <Pressable
                  key={r}
                  disabled={busy}
                  onPress={() => setReason(r)}
                  style={({ pressed }) => [
                    styles.chip,
                    reason === r && styles.chipSelected,
                    { opacity: busy ? 0.6 : pressed ? 0.8 : 1 },
                  ]}
                >
                  <Text style={[styles.chipLabel, reason === r && styles.chipLabelSelected]}>
                    {REASON_LABELS[r]}
                  </Text>
                </Pressable>
              ))}
            </View>
            {feedback ? <Text style={{ color: colors.textMuted, marginTop: 10 }}>{feedback}</Text> : null}
            <Button label="CONFIRMAR MOTIVO" loading={busy} onPress={handleConfirm} />
            <Button label="Cancelar" variant="secondary" onPress={() => navigation.goBack()} />
          </Card>
        </>
      ) : (
        <Card>
          <Text style={{ color: colors.text }}>
            Nenhum período de parada em aberto para o seu veículo. Ele já pode ter saído para a próxima viagem.
          </Text>
          <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
        </Card>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.surface, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: colors.primary },
  chipLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chipLabelSelected: { color: colors.background },
});
