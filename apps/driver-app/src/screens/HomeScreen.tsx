import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverRoute, NearbyTollPlaza } from '../api/driverTrips.types';
import { useAuth } from '../auth/AuthContext';
import { useLocationTracker } from '../location/useLocationTracker';
import { submitOrQueue } from '../storage/syncQueue';
import { useTrip } from '../trip/TripContext';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/types';

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

// Tela principal (Fase 25, secao 19) -- um unico card + 4 acoes quando a
// viagem esta em andamento. Antes disso, o proprio card muda de forma
// (iniciar / retomar-ou-encerrar) para cobrir a retomada da secao 2, sem
// precisar de telas separadas para cada estado.
export function HomeScreen({ navigation }: Props): React.JSX.Element {
  const { logout, driverName } = useAuth();
  const { activeTrip, config, isLoading, refresh } = useTrip();
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [route, setRoute] = useState<DriverRoute | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [nearbyPlaza, setNearbyPlaza] = useState<NearbyTollPlaza | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const isTracking = activeTrip?.status === 'IN_PROGRESS';
  useLocationTracker(isTracking ? activeTrip!.id : null, config);

  // Rota planejada (Fase 26) -- visao minima (proximo pedagio, distancia).
  // So enquanto a viagem esta em andamento; atualiza a cada ping de GPS
  // (mesmo intervalo ja configurado, sem inventar um novo parametro).
  // Fase 29, secao 13/14 -- o mesmo ciclo tambem verifica pracas de pedagio
  // proximas (reaproveita GET /driver/trips/:id/nearby-toll-plazas, ja usado
  // pela TollScreen) para so entao destacar "Pedagio proximo" na tela
  // principal quando realmente houver uma acao a considerar.
  useEffect(() => {
    if (!isTracking || !activeTrip) {
      setRoute(null);
      setNearbyPlaza(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      driverTripsApi
        .getRoute(activeTrip.id)
        .then((result) => {
          if (!cancelled) setRoute(result);
        })
        .catch(() => undefined);

      const position = await Location.getLastKnownPositionAsync().catch(() => null);
      if (!position || cancelled) return;
      driverTripsApi
        .getNearbyTollPlazas(activeTrip.id, position.coords.latitude, position.coords.longitude)
        .then((plazas) => {
          if (!cancelled) setNearbyPlaza(plazas[0] ?? null);
        })
        .catch(() => undefined);
    };
    void load();
    const interval = setInterval(load, Math.max(config?.gpsPingIntervalSeconds ?? 30, 15) * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isTracking, activeTrip, config]);

  async function handleRecalculateRoute(): Promise<void> {
    if (!activeTrip) return;
    setRecalculating(true);
    try {
      await driverTripsApi.recalculateRoute(activeTrip.id);
      const updated = await driverTripsApi.getRoute(activeTrip.id);
      setRoute(updated);
    } finally {
      setRecalculating(false);
    }
  }

  // Posicao GPS atual, quando disponivel (Fase 28) -- nunca bloqueia a
  // acao de pausar/retomar se o dispositivo estiver sem sinal.
  async function getCurrentPosition(): Promise<{ latitude: number; longitude: number } | undefined> {
    const position = await Location.getLastKnownPositionAsync().catch(() => null);
    return position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : undefined;
  }

  // Fase 30, secao 10/11 -- pausar/retomar passam pela MESMA fila offline ja
  // usada por abastecimento/parada/eixo (submitOrQueue): sem conexao, a acao
  // fica pendente e e reenviada automaticamente no proximo refresh() com
  // rede disponivel (TripContext.refresh() ja chama flushQueue()). O status
  // exibido so muda de fato quando o backend confirmar (proximo refresh),
  // por isso o aviso abaixo -- nunca finge que ja mudou localmente.
  async function withSyncNotice(action: () => Promise<{ queued: boolean }>): Promise<void> {
    setBusy(true);
    try {
      const result = await action();
      if (result.queued) {
        setSyncNotice('Sem conexao agora -- sera sincronizado automaticamente assim que possivel.');
      } else {
        setSyncNotice(null);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onPullToRefresh(): Promise<void> {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />
      </ScreenContainer>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullToRefresh} />}
    >
      <View style={{ padding: 20, gap: 16 }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>
          Ola, {driverName ?? 'motorista'}
        </Text>

        {!activeTrip ? (
          <Card>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              Nenhuma viagem atribuida no momento.
            </Text>
            <Text style={{ color: colors.textMuted }}>
              Assim que uma viagem for despachada para voce, ela aparecera aqui.
            </Text>
          </Card>
        ) : activeTrip.status === 'PAUSED' ? (
          <Card>
            <Text style={{ color: colors.warning, fontWeight: '700' }}>VIAGEM PAUSADA</Text>
            <Text style={{ color: colors.text }}>Destino: {activeTrip.destinationName}</Text>
            <Text style={{ color: colors.textMuted }}>Veiculo: {activeTrip.vehiclePlate ?? '-'}</Text>
            <Button
              label="CONTINUAR VIAGEM"
              loading={busy}
              onPress={() =>
                withSyncNotice(async () => {
                  const position = await getCurrentPosition();
                  return submitOrQueue({ kind: 'resume', tripId: activeTrip.id, ...position });
                })
              }
            />
            {syncNotice && <Text style={{ color: colors.textMuted }}>{syncNotice}</Text>}
            <Button
              label="Checklist pos-viagem"
              variant="secondary"
              onPress={() => navigation.navigate('Checklist', { tripId: activeTrip.id, type: 'POST_TRIP' })}
            />
            <Button
              label="ENCERRAR VIAGEM"
              variant="danger"
              onPress={() => navigation.navigate('FinishTrip', { tripId: activeTrip.id })}
            />
          </Card>
        ) : activeTrip.status === 'IN_PROGRESS' ? (
          <>
            <Card>
              <Text style={{ color: colors.success, fontWeight: '700' }}>VIAGEM EM ANDAMENTO</Text>
              <Text style={{ color: colors.text }}>Destino: {activeTrip.destinationName}</Text>
              <Text style={{ color: colors.textMuted }}>Veiculo: {activeTrip.vehiclePlate ?? '-'}</Text>
              <Button
                label="PAUSAR VIAGEM"
                variant="secondary"
                loading={busy}
                onPress={() =>
                  withSyncNotice(async () => {
                    const position = await getCurrentPosition();
                    return submitOrQueue({ kind: 'pause', tripId: activeTrip.id, ...position });
                  })
                }
              />
              {syncNotice && <Text style={{ color: colors.textMuted }}>{syncNotice}</Text>}
              <Button
                label="ENCERRAR VIAGEM"
                variant="danger"
                onPress={() => navigation.navigate('FinishTrip', { tripId: activeTrip.id })}
              />
            </Card>

            {route?.hasUnresolvedDeviation && (
              <Card style={{ borderColor: colors.warning }}>
                <Text style={{ color: colors.warning, fontWeight: '700' }}>DESVIO DETECTADO</Text>
                <Text style={{ color: colors.textMuted }}>
                  Voce esta fora da rota planejada ha algum tempo.
                </Text>
                <Button
                  label="RECALCULAR ROTA"
                  variant="secondary"
                  loading={recalculating}
                  onPress={handleRecalculateRoute}
                />
              </Card>
            )}

            {route && (
              <Card>
                <Text style={{ color: colors.text, fontWeight: '700' }}>ROTA ATIVA</Text>
                {route.nextToll ? (
                  <>
                    <Text style={{ color: colors.text }}>Proximo pedagio: {route.nextToll.name}</Text>
                    <Text style={{ color: colors.textMuted }}>
                      Distancia: {formatKm(route.nextToll.distanceMeters)}
                    </Text>
                    <Text style={{ color: colors.textMuted }}>
                      Eixos padrao: {route.nextToll.defaultAxles}
                    </Text>
                  </>
                ) : (
                  <Text style={{ color: colors.textMuted }}>Nenhum pedagio previsto a frente.</Text>
                )}
                {route.distanceRemainingMeters !== null && (
                  <Text style={{ color: colors.textMuted }}>
                    Restante ate o destino: {formatKm(route.distanceRemainingMeters)}
                  </Text>
                )}
                {!route.hasUnresolvedDeviation && (
                  <Button
                    label="Recalcular rota"
                    variant="secondary"
                    loading={recalculating}
                    onPress={handleRecalculateRoute}
                  />
                )}
              </Card>
            )}

            {nearbyPlaza && (
              <Card style={{ borderColor: colors.warning }}>
                <Text style={{ color: colors.warning, fontWeight: '700' }}>PEDAGIO PROXIMO</Text>
                <Text style={{ color: colors.text }}>{nearbyPlaza.name}</Text>
                <Button
                  label="Confirmar eixos"
                  onPress={() => navigation.navigate('Toll', { tripId: activeTrip.id })}
                />
              </Card>
            )}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <View style={{ flexGrow: 1, minWidth: '45%' }}>
                <Button label="Abastecimento" onPress={() => navigation.navigate('Fuel', { tripId: activeTrip.id })} />
              </View>
              <View style={{ flexGrow: 1, minWidth: '45%' }}>
                <Button
                  label="Pedagio"
                  variant="secondary"
                  onPress={() => navigation.navigate('Toll', { tripId: activeTrip.id })}
                />
              </View>
              <View style={{ flexGrow: 1, minWidth: '45%' }}>
                <Button
                  label="Paradas"
                  variant="secondary"
                  onPress={() => navigation.navigate('Stops', { tripId: activeTrip.id })}
                />
              </View>
              <View style={{ flexGrow: 1, minWidth: '45%' }}>
                <Button
                  label="Comprovante de entrega"
                  variant="secondary"
                  onPress={() => navigation.navigate('DeliveryProof', { tripId: activeTrip.id })}
                />
              </View>
              <View style={{ flexGrow: 1, minWidth: '45%' }}>
                <Button
                  label="Checklist pos-viagem"
                  variant="secondary"
                  onPress={() => navigation.navigate('Checklist', { tripId: activeTrip.id, type: 'POST_TRIP' })}
                />
              </View>
            </View>
          </>
        ) : (
          <Card>
            <Text style={{ color: colors.text, fontWeight: '700' }}>VIAGEM DESPACHADA</Text>
            <Text style={{ color: colors.text }}>Destino: {activeTrip.destinationName}</Text>
            <Text style={{ color: colors.textMuted }}>Veiculo: {activeTrip.vehiclePlate ?? '-'}</Text>
            {/* Fase 39 -- checklist pre-viagem e opcional aqui: nunca bloqueia
                INICIAR VIAGEM (secao 22/44 -- o bloqueio automatico fica
                para uma fase futura, mediante decisao explicita). */}
            <Button
              label="Checklist pre-viagem"
              variant="secondary"
              onPress={() => navigation.navigate('Checklist', { tripId: activeTrip.id, type: 'PRE_TRIP' })}
            />
            <Button
              label="INICIAR VIAGEM"
              onPress={() => navigation.navigate('StartTrip', { tripId: activeTrip.id })}
            />
          </Card>
        )}

        <Button label="Sair" variant="secondary" onPress={() => logout()} />
      </View>
    </ScrollView>
  );
}
