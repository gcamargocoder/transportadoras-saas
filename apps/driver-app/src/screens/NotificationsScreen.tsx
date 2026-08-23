import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as notificationsApi from '../api/driverNotifications.api';
import { DriverNotification, NotificationSeverity } from '../api/driverNotifications.types';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  LOW: colors.textMuted,
  MEDIUM: colors.primary,
  HIGH: colors.warning,
  CRITICAL: colors.danger,
};

// Fase 70 -- so os tipos com o motorista como destinatario DIRETO tem
// origem navegavel dentro do app hoje (DeliveryProofScreen ja existe e
// recebe so {tripId}, ver DriverTripsController Fase 56). Qualquer outro
// entityType (nunca deveria chegar aqui, ver NOTIFICATION_RECIPIENT_ROLES,
// mas o app nao pode travar se um tipo futuro passar a incluir DRIVER)
// nunca navega para uma rota inventada -- so marca como lida.
function resolveOrigin(notification: DriverNotification): { screen: 'DeliveryProof'; tripId: string } | null {
  const tripId = typeof notification.metadata?.tripId === 'string' ? notification.metadata.tripId : undefined;
  if (notification.entityType === 'FiscalDocument' && tripId) {
    return { screen: 'DeliveryProof', tripId };
  }
  return null;
}

// Leitura de notificacoes e ONLINE (secao 16 do pedido) -- sem cache/fila
// offline complexa aqui; sem conexao, so mostra o estado de indisponibilidade
// abaixo, nunca apaga notificacoes ja carregadas localmente por falha de rede.
export function NotificationsScreen({ navigation }: Props): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DriverNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await notificationsApi.getNotifications({ pageSize: 50 });
      setItems(result.items);
    } catch {
      setError('Nao foi possivel carregar as notificacoes agora. Verifique sua conexao.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePress(notification: DriverNotification): Promise<void> {
    if (markingId) return;
    setMarkingId(notification.id);
    try {
      if (!notification.readAt) {
        const updated = await notificationsApi.markNotificationRead(notification.id).catch(() => null);
        if (updated) {
          setItems((prev) => prev.map((n) => (n.id === notification.id ? updated : n)));
        }
      }
      const origin = resolveOrigin(notification);
      if (origin) {
        navigation.navigate(origin.screen, { tripId: origin.tripId });
      }
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>Notificações</Text>
        <Button label="Atualizar" variant="secondary" onPress={load} />
      </View>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ gap: 10, marginTop: 4 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => handlePress(item)} disabled={markingId === item.id}>
              <Card {...(!item.readAt ? { style: { borderColor: SEVERITY_COLORS[item.severity] } } : {})}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text style={{ color: colors.text, fontWeight: item.readAt ? '500' : '700', flex: 1 }}>
                    {item.title}
                  </Text>
                  {!item.readAt && (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: SEVERITY_COLORS[item.severity],
                        marginLeft: 8,
                        marginTop: 4,
                      }}
                    />
                  )}
                </View>
                <Text style={{ color: colors.textMuted }}>{item.message}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{new Date(item.createdAt).toLocaleString()}</Text>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={{ color: colors.textMuted }}>Nenhuma notificação por aqui.</Text>}
        />
      )}

      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}
