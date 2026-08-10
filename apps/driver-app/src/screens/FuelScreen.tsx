import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { generateDeviceEventId } from '../storage/deviceEventId';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';
import { compact } from '../utils/compact';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Fuel'>;

type FuelLocation = 'TRANSPORTADORA' | 'OUTRO';

// ABASTECIMENTO EM ROTA (Fase 25, secao 8; Fase 28, secao 7/8) -- KM, litros
// e valor pago. Tudo o mais (viagem, veiculo, motorista, data/hora, posto
// quando existir) e derivado automaticamente pelo backend. "Local" so decide
// se o app tenta capturar GPS (fora da transportadora); quando o
// abastecimento e interno, nenhuma localizacao e enviada (mesmo padrao ja
// usado na tela "INICIAR VIAGEM", nunca duplicado aqui).
export function FuelScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId } = route.params;
  const [odometerKm, setOdometerKm] = useState('');
  const [liters, setLiters] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [fuelLocation, setFuelLocation] = useState<FuelLocation>('TRANSPORTADORA');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleConfirm(): Promise<void> {
    const odometer = Number(odometerKm.replace(',', '.'));
    const litersValue = Number(liters.replace(',', '.'));
    const amountValue = Number(amountPaid.replace(',', '.'));
    if (!odometer || !litersValue || !amountValue) {
      setFeedback('Informe KM, litros e valor pago validos.');
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const position =
        fuelLocation === 'OUTRO' ? await Location.getLastKnownPositionAsync().catch(() => null) : null;
      const result = await submitOrQueue({
        kind: 'fuel-supply',
        tripId,
        deviceEventId: generateDeviceEventId(),
        odometerKm: odometer,
        liters: litersValue,
        pricePerLiter: amountValue / litersValue,
        ...compact({ latitude: position?.coords.latitude, longitude: position?.coords.longitude }),
      });
      setFeedback(
        result.queued
          ? 'Sem conexao agora -- sera enviado automaticamente assim que possivel.'
          : 'Abastecimento registrado.',
      );
      setOdometerKm('');
      setLiters('');
      setAmountPaid('');
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
      <TextField
        label="Valor pago"
        value={amountPaid}
        onChangeText={setAmountPaid}
        keyboardType="numeric"
      />

      <Card>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Local</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Transportadora"
              variant={fuelLocation === 'TRANSPORTADORA' ? 'primary' : 'secondary'}
              onPress={() => setFuelLocation('TRANSPORTADORA')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Outro local"
              variant={fuelLocation === 'OUTRO' ? 'primary' : 'secondary'}
              onPress={() => setFuelLocation('OUTRO')}
            />
          </View>
        </View>
      </Card>

      {feedback ? <Text style={{ color: colors.textMuted }}>{feedback}</Text> : null}
      <Button label="CONFIRMAR" onPress={handleConfirm} loading={submitting} />
      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}
