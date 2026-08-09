import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import * as driverTripsApi from '../api/driverTrips.api';
import { NearbyTollPlaza } from '../api/driverTrips.types';
import { generateDeviceEventId } from '../storage/deviceEventId';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';
import { compact } from '../utils/compact';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Toll'>;

// Timeout do alerta de pedagio (Fase 25, secao 14) -- se o motorista nao
// responder neste prazo, assume automaticamente a quantidade padrao. Nao e
// erro, e comportamento normal.
const ALERT_TIMEOUT_SECONDS = 20;

// PEDAGIO PROXIMO (Fase 25, secoes 11-14). A ausencia de interacao = eixos
// padrao (regra fundamental da fase); "ALTERAR EIXOS" so registra uma
// EXCECAO temporaria, nunca muda a composicao do veiculo.
export function TollScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId } = route.params;
  const [loading, setLoading] = useState(true);
  const [plazas, setPlazas] = useState<NearbyTollPlaza[]>([]);
  const [resolvedEventId, setResolvedEventId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [customAxles, setCustomAxles] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(ALERT_TIMEOUT_SECONDS);
  const resolvedRef = useRef(false);

  const loadNearby = useCallback(async () => {
    setLoading(true);
    resolvedRef.current = false;
    setResolvedEventId(null);
    setSecondsLeft(ALERT_TIMEOUT_SECONDS);
    try {
      const position = await Location.getLastKnownPositionAsync();
      if (!position) {
        setPlazas([]);
        return;
      }
      const nearby = await driverTripsApi.getNearbyTollPlazas(
        tripId,
        position.coords.latitude,
        position.coords.longitude,
      );
      setPlazas(nearby);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void loadNearby();
  }, [loadNearby]);

  const nearest = plazas[0] ?? null;

  const registerAxlePassage = useCallback(
    async (declaredAxles: number | undefined, source: 'DRIVER_INPUT' | 'TIMEOUT_DEFAULT') => {
      if (!nearest || resolvedRef.current) return;
      resolvedRef.current = true;
      const position = await Location.getLastKnownPositionAsync().catch(() => null);
      const deviceEventId = generateDeviceEventId();
      await submitOrQueue({
        kind: 'axle-event-open',
        tripId,
        deviceEventId,
        tollPlazaId: nearest.tollPlazaId,
        source,
        latitude: position?.coords.latitude ?? 0,
        longitude: position?.coords.longitude ?? 0,
        ...compact({ declaredAxles }),
      });
      setResolvedEventId(deviceEventId);
    },
    [nearest, tripId],
  );

  // Contagem regressiva: sem resposta ate zerar, assume o padrao
  // automaticamente (nunca bloqueia nem gera erro).
  useEffect(() => {
    if (!nearest || resolvedRef.current) return;
    if (secondsLeft <= 0) {
      void registerAxlePassage(undefined, 'TIMEOUT_DEFAULT');
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, nearest, registerAxlePassage]);

  if (loading) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>
        Pedagio
      </Text>

      {!nearest ? (
        <Card>
          <Text style={{ color: colors.text }}>Nenhuma praca de pedagio proxima no momento.</Text>
        </Card>
      ) : (
        <Card>
          <Text style={{ color: colors.warning, fontWeight: '700' }}>PEDAGIO PROXIMO</Text>
          <Text style={{ color: colors.text }}>Praca: {nearest.name}</Text>
          <Text style={{ color: colors.textMuted }}>Distancia: {nearest.distanceMeters} m</Text>
          <Text style={{ color: colors.text }}>Eixos cadastrados: {nearest.defaultAxles}</Text>

          {resolvedEventId ? (
            <Text style={{ color: colors.success }}>Registrado.</Text>
          ) : editing ? (
            <>
              <TextField
                label="Quantos eixos passarao pelo pedagio?"
                value={customAxles}
                onChangeText={setCustomAxles}
                keyboardType="numeric"
              />
              <Button
                label="CONFIRMAR"
                onPress={() => registerAxlePassage(Number(customAxles) || undefined, 'DRIVER_INPUT')}
              />
            </>
          ) : (
            <>
              <Text style={{ color: colors.textMuted }}>
                Sem resposta em {secondsLeft}s, sera considerado {nearest.defaultAxles} eixos.
              </Text>
              <Button label="ALTERAR EIXOS" variant="secondary" onPress={() => setEditing(true)} />
            </>
          )}
        </Card>
      )}

      <Button label="Atualizar" variant="secondary" onPress={loadNearby} />
      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}
