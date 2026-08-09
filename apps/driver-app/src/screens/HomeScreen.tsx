import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverRoute } from '../api/driverTrips.types';
import { useAuth } from '../auth/AuthContext';
import { useLocationTracker } from '../location/useLocationTracker';
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

  const isTracking = activeTrip?.status === 'IN_PROGRESS';
  useLocationTracker(isTracking ? activeTrip!.id : null, config);

  // Rota planejada (Fase 26) -- visao minima (proximo pedagio, distancia).
  // So enquanto a viagem esta em andamento; atualiza a cada ping de GPS
  // (mesmo intervalo ja configurado, sem inventar um novo parametro).
  useEffect(() => {
    if (!isTracking || !activeTrip) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      driverTripsApi
        .getRoute(activeTrip.id)
        .then((result) => {
          if (!cancelled) setRoute(result);
        })
        .catch(() => undefined);
    };
    load();
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

  async function withBusy(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
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
              onPress={() => withBusy(() => driverTripsApi.resumeTrip(activeTrip.id).then(() => undefined))}
            />
            <Button
              label="ENCERRAR VIAGEM"
              variant="danger"
              loading={busy}
              onPress={() => withBusy(() => driverTripsApi.completeTrip(activeTrip.id).then(() => undefined))}
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
                onPress={() => withBusy(() => driverTripsApi.pauseTrip(activeTrip.id).then(() => undefined))}
              />
              <Button
                label="ENCERRAR VIAGEM"
                variant="danger"
                loading={busy}
                onPress={() => withBusy(() => driverTripsApi.completeTrip(activeTrip.id).then(() => undefined))}
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
            </View>
          </>
        ) : (
          <Card>
            <Text style={{ color: colors.text, fontWeight: '700' }}>VIAGEM DESPACHADA</Text>
            <Text style={{ color: colors.text }}>Destino: {activeTrip.destinationName}</Text>
            <Text style={{ color: colors.textMuted }}>Veiculo: {activeTrip.vehiclePlate ?? '-'}</Text>
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
