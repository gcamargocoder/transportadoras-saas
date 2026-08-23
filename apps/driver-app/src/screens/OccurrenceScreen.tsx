import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as driverTripsApi from '../api/driverTrips.api';
import { TripOccurrence, TripOccurrenceSeverity, TripOccurrenceType } from '../api/driverTrips.types';
import { generateDeviceEventId } from '../storage/deviceEventId';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Occurrence'>;

const OCCURRENCE_TYPE_LABELS: Record<TripOccurrenceType, string> = {
  ACCIDENT: 'Acidente',
  BREAKDOWN: 'Quebra/pane',
  DELAY: 'Atraso',
  ROUTE_DEVIATION: 'Desvio de rota',
  DELIVERY_PROBLEM: 'Problema na entrega',
  DOCUMENT_PROBLEM: 'Problema documental',
  VEHICLE_PROBLEM: 'Problema no veiculo',
  FUEL_PROBLEM: 'Problema de combustivel',
  TIRE_PROBLEM: 'Problema de pneu',
  OTHER: 'Outro',
};

const OCCURRENCE_TYPES = Object.keys(OCCURRENCE_TYPE_LABELS) as TripOccurrenceType[];

const SEVERITY_LABELS: Record<TripOccurrenceSeverity, string> = {
  INFO: 'Informativa',
  WARNING: 'Atencao',
  CRITICAL: 'Critica',
};

// Fase 67 -- registro de ocorrencias pelo motorista. Mesmo padrao
// offline-first ja usado em StopsScreen: tenta enviar na hora, se falhar
// enfileira (syncQueue.ts, kind 'occurrence-create') e reenvia sozinho na
// proxima sincronizacao -- idempotente por deviceEventId.
export function OccurrenceScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId } = route.params;
  const [loading, setLoading] = useState(true);
  const [occurrences, setOccurrences] = useState<TripOccurrence[]>([]);
  const [type, setType] = useState<TripOccurrenceType | null>(null);
  const [severity, setSeverity] = useState<TripOccurrenceSeverity>('INFO');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await driverTripsApi.getOccurrences(tripId).catch(() => [] as TripOccurrence[]);
      setOccurrences(list);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(): Promise<void> {
    if (!type || description.trim().length === 0) {
      setFeedback('Selecione o tipo e descreva o que aconteceu.');
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const deviceEventId = generateDeviceEventId();
      const occurredAt = new Date().toISOString();
      const position = await Location.getLastKnownPositionAsync().catch(() => null);

      const result = await submitOrQueue({
        kind: 'occurrence-create',
        tripId,
        deviceEventId,
        type,
        severity,
        description: description.trim(),
        occurredAt,
        ...(position
          ? { latitude: position.coords.latitude, longitude: position.coords.longitude }
          : {}),
      });

      setType(null);
      setSeverity('INFO');
      setDescription('');
      setFeedback(result.queued ? 'Sem conexao agora -- a ocorrencia sera enviada automaticamente.' : 'Ocorrencia registrada.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>Ocorrências</Text>

      <Card>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Tipo</Text>
        <View style={styles.grid}>
          {OCCURRENCE_TYPES.map((t) => (
            <Pressable
              key={t}
              disabled={busy}
              onPress={() => setType(t)}
              style={({ pressed }) => [
                styles.chip,
                type === t && styles.chipSelected,
                { opacity: busy ? 0.6 : pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.chipLabel, type === t && styles.chipLabelSelected]}>
                {OCCURRENCE_TYPE_LABELS[t]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ color: colors.text, fontWeight: '700', marginTop: 16, marginBottom: 8 }}>Severidade</Text>
        <View style={styles.grid}>
          {(Object.keys(SEVERITY_LABELS) as TripOccurrenceSeverity[]).map((s) => (
            <Pressable
              key={s}
              disabled={busy}
              onPress={() => setSeverity(s)}
              style={({ pressed }) => [
                styles.chip,
                severity === s && styles.chipSelected,
                { opacity: busy ? 0.6 : pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.chipLabel, severity === s && styles.chipLabelSelected]}>
                {SEVERITY_LABELS[s]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ color: colors.text, fontWeight: '700', marginTop: 16, marginBottom: 8 }}>
          O que aconteceu
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholder="Descreva a ocorrência"
          placeholderTextColor={colors.textMuted}
          style={styles.textArea}
        />

        <Button label="REGISTRAR OCORRÊNCIA" loading={busy} onPress={handleSubmit} />
        {feedback ? <Text style={{ color: colors.textMuted, marginTop: 8 }}>{feedback}</Text> : null}
      </Card>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={occurrences}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={{ gap: 10, marginTop: 12 }}
          renderItem={({ item }) => (
            <Card>
              <Text style={{ color: colors.text, fontWeight: '600' }}>
                {OCCURRENCE_TYPE_LABELS[item.type] ?? item.type} · {SEVERITY_LABELS[item.severity]}
              </Text>
              <Text style={{ color: colors.textMuted }}>{item.description}</Text>
              <Text style={{ color: colors.textMuted }}>{new Date(item.occurredAt).toLocaleString()}</Text>
              <Text style={{ color: colors.textMuted }}>
                {item.status === 'OPEN' ? 'Em aberto' : item.status === 'RESOLVED' ? 'Resolvida' : 'Cancelada'}
              </Text>
            </Card>
          )}
          ListEmptyComponent={<Text style={{ color: colors.textMuted }}>Nenhuma ocorrência registrada.</Text>}
        />
      )}

      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  chipLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  chipLabelSelected: {
    color: colors.background,
  },
  textArea: {
    minHeight: 80,
    borderRadius: 8,
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 12,
    textAlignVertical: 'top',
  },
});
