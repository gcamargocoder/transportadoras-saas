import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverTrip, FuelType, TripLoadStatus } from '../api/driverTrips.types';
import { generateDeviceEventId } from '../storage/deviceEventId';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'StartTrip'>;

type FuelChoice = 'NONE' | 'SUPPLIED';
type FuelLocation = 'TRANSPORTADORA' | 'OUTRO';

// Gap real encontrado na auditoria "TMS + Driver App" -- ver mesmo comentario
// em FuelScreen.tsx (o abastecimento inicial usa o mesmo formulario/payload,
// nunca uma segunda logica).
const FUEL_TYPE_OPTIONS: { value: FuelType; label: string }[] = [
  { value: 'DIESEL_S10', label: 'Diesel S10' },
  { value: 'DIESEL_S500', label: 'Diesel S500' },
  { value: 'ARLA32', label: 'Arla 32' },
  { value: 'GASOLINA', label: 'Gasolina' },
  { value: 'ETANOL', label: 'Etanol' },
  { value: 'OUTRO', label: 'Outro' },
];

// Tela "INICIAR VIAGEM" (Fase 27, secao 2) -- unico formulario antes da
// largada: caminhao/eixos/origem/destino vem PRE-PREENCHIDOS da viagem ja
// despachada pelo escritorio (nunca editaveis aqui, ver secao 3); o
// motorista so informa o que realmente muda a cada viagem: KM, abastecimento
// inicial (opcional) e carregado/vazio.
export function StartTripScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId } = route.params;
  const [trip, setTrip] = useState<DriverTrip | null>(null);
  const [odometerKm, setOdometerKm] = useState('');
  const [loadStatus, setLoadStatus] = useState<TripLoadStatus | null>(null);
  const [fuelChoice, setFuelChoice] = useState<FuelChoice>('NONE');
  const [fuelType, setFuelType] = useState<FuelType>('DIESEL_S10');
  const [fuelLocation, setFuelLocation] = useState<FuelLocation>('TRANSPORTADORA');
  const [liters, setLiters] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    driverTripsApi.getTrip(tripId).then(setTrip).catch(() => setError('Nao foi possivel carregar a viagem.'));
  }, [tripId]);

  const parsedOdometer = Number(odometerKm.replace(',', '.'));
  const parsedLiters = Number(liters.replace(',', '.'));
  const parsedAmount = Number(amountPaid.replace(',', '.'));

  const canSubmit =
    Number.isFinite(parsedOdometer) &&
    parsedOdometer > 0 &&
    loadStatus !== null &&
    (fuelChoice === 'NONE' ||
      (Number.isFinite(parsedLiters) && parsedLiters > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0));

  async function handleStart(): Promise<void> {
    if (!canSubmit || !loadStatus) {
      setError('Preencha o KM atual e informe se a carga esta carregada ou vazia.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (fuelChoice === 'SUPPLIED') {
        const position =
          fuelLocation === 'OUTRO' ? await Location.getLastKnownPositionAsync().catch(() => null) : null;
        await submitOrQueue({
          kind: 'fuel-supply',
          tripId,
          deviceEventId: generateDeviceEventId(),
          odometerKm: parsedOdometer,
          liters: parsedLiters,
          fuelType,
          pricePerLiter: parsedAmount / parsedLiters,
          ...(position
            ? { latitude: position.coords.latitude, longitude: position.coords.longitude }
            : {}),
        });
      }
      await driverTripsApi.startTrip(tripId, { odometerKm: parsedOdometer, loadStatus });
      navigation.replace('Home');
    } catch {
      setError('Nao foi possivel iniciar a viagem. Verifique a conexao e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!trip) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>
        Iniciar viagem
      </Text>

      <Card>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Caminhao</Text>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
          {trip.vehiclePlate ?? '-'}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>
          Eixos (configuracao normal)
        </Text>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
          {trip.defaultAxles !== null ? `${trip.defaultAxles} eixos` : '-'}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Origem</Text>
        <Text style={{ color: colors.text }}>{trip.originName}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Destino</Text>
        <Text style={{ color: colors.text }}>{trip.destinationName}</Text>
      </Card>

      <TextField
        label="KM atual"
        value={odometerKm}
        onChangeText={setOdometerKm}
        keyboardType="numeric"
      />

      <Card>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Abastecimento</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Nao abasteci"
              variant={fuelChoice === 'NONE' ? 'primary' : 'secondary'}
              onPress={() => setFuelChoice('NONE')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Abasteci"
              variant={fuelChoice === 'SUPPLIED' ? 'primary' : 'secondary'}
              onPress={() => setFuelChoice('SUPPLIED')}
            />
          </View>
        </View>

        {fuelChoice === 'SUPPLIED' && (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Tipo</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {FUEL_TYPE_OPTIONS.map((option) => (
                <View key={option.value} style={{ width: '31%' }}>
                  <Button
                    label={option.label}
                    variant={fuelType === option.value ? 'primary' : 'secondary'}
                    onPress={() => setFuelType(option.value)}
                  />
                </View>
              ))}
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Local</Text>
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
            <TextField label="Litros" value={liters} onChangeText={setLiters} keyboardType="numeric" />
            <TextField
              label="Valor pago"
              value={amountPaid}
              onChangeText={setAmountPaid}
              keyboardType="numeric"
            />
          </>
        )}
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Status da carga</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Carregado"
              variant={loadStatus === 'LOADED' ? 'primary' : 'secondary'}
              onPress={() => setLoadStatus('LOADED')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Vazio"
              variant={loadStatus === 'EMPTY' ? 'primary' : 'secondary'}
              onPress={() => setLoadStatus('EMPTY')}
            />
          </View>
        </View>
      </Card>

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <Button label="INICIAR VIAGEM" onPress={handleStart} loading={submitting} disabled={!canSubmit} />
      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}
