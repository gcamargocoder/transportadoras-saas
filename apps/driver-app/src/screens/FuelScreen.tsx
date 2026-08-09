import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button } from '../components/Button';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { generateDeviceEventId } from '../storage/deviceEventId';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';
import { compact } from '../utils/compact';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Fuel'>;

// ABASTECIMENTO (Fase 25, secao 8) -- somente KM atual + litros. Tudo o mais
// (viagem, veiculo, motorista, data/hora, localizacao, posto quando existir)
// e derivado automaticamente pelo backend; o app so acrescenta a
// localizacao GPS quando disponivel (nunca inventa um posto).
export function FuelScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId } = route.params;
  const [odometerKm, setOdometerKm] = useState('');
  const [liters, setLiters] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleConfirm(): Promise<void> {
    const odometer = Number(odometerKm.replace(',', '.'));
    const litersValue = Number(liters.replace(',', '.'));
    if (!odometer || !litersValue) {
      setFeedback('Informe KM e litros validos.');
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const position = await Location.getLastKnownPositionAsync().catch(() => null);
      const result = await submitOrQueue({
        kind: 'fuel-supply',
        tripId,
        deviceEventId: generateDeviceEventId(),
        odometerKm: odometer,
        liters: litersValue,
        ...compact({ latitude: position?.coords.latitude, longitude: position?.coords.longitude }),
      });
      setFeedback(
        result.queued
          ? 'Sem conexao agora -- sera enviado automaticamente assim que possivel.'
          : 'Abastecimento registrado.',
      );
      setOdometerKm('');
      setLiters('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>
        Abastecimento
      </Text>
      <TextField
        label="KM atual"
        value={odometerKm}
        onChangeText={setOdometerKm}
        keyboardType="numeric"
      />
      <TextField label="Litros" value={liters} onChangeText={setLiters} keyboardType="numeric" />
      {feedback ? <Text style={{ color: colors.textMuted }}>{feedback}</Text> : null}
      <Button label="CONFIRMAR" onPress={handleConfirm} loading={submitting} />
      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}
