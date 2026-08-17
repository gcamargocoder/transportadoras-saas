import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { RootStackParamList } from '../navigation/types';
import { generateDeviceEventId } from '../storage/deviceEventId';
import { persistDeliveryProofFile } from '../storage/deliveryProofFiles';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';
import { compact } from '../utils/compact';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryProof'>;

// Fase 56 -- "Viagem -> Entrega -> Registrar comprovante": foto (camera ou
// galeria) + observacao opcional, offline-first (mesma fila/idempotencia
// ja usada por checklist/abastecimento/parada, nunca um mecanismo novo).
// PDF nao e suportado aqui (sem expo-document-picker instalado no app --
// limitacao real desta fase; upload de PDF continua disponivel pelo painel
// administrativo, ver docs/fiscal-documents.md).
export function DeliveryProofScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId } = route.params;
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [observation, setObservation] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function capture(fromCamera: boolean): Promise<void> {
    setError(null);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        fromCamera
          ? 'Permissao de camera negada. Ative o acesso a camera nas configuracoes do celular.'
          : 'Permissao de galeria negada. Ative o acesso as fotos nas configuracoes do celular.',
      );
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.5 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.5 });
    if (result.canceled || !result.assets?.[0]) return;

    setCapturing(true);
    try {
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const persistedUri = await persistDeliveryProofFile(result.assets[0].uri, fileName);
      setLocalUri(persistedUri);
    } catch {
      setError('Nao foi possivel salvar a foto. Tente novamente.');
    } finally {
      setCapturing(false);
    }
  }

  async function handleConfirm(): Promise<void> {
    if (!localUri) {
      setError('Tire uma foto do comprovante antes de confirmar.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitOrQueue({
        kind: 'delivery-proof',
        tripId,
        deviceEventId: generateDeviceEventId(),
        capturedAt: new Date().toISOString(),
        localFileUri: localUri,
        fileName: `comprovante-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        ...compact({ observation: observation.trim() || undefined }),
      });
      setFeedback(
        result.queued
          ? 'Sem conexao agora -- o comprovante sera enviado automaticamente assim que possivel.'
          : 'Comprovante de entrega registrado.',
      );
      setLocalUri(null);
      setObservation('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>
        Comprovante de entrega
      </Text>

      <Card>
        {localUri ? (
          <View style={{ gap: 8 }}>
            <Image
              source={{ uri: localUri }}
              style={{ width: '100%', height: 220, borderRadius: 8 }}
              accessibilityLabel="Foto do comprovante de entrega"
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button label="Refazer" variant="secondary" loading={capturing} onPress={() => capture(true)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Remover" variant="danger" onPress={() => setLocalUri(null)} />
              </View>
            </View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.textMuted }}>
              Tire uma foto do comprovante (canhoto assinado, recibo, etc.) para confirmar a entrega.
            </Text>
            <Button label="Tirar foto" loading={capturing} onPress={() => capture(true)} />
            <Button label="Escolher da galeria" variant="secondary" loading={capturing} onPress={() => capture(false)} />
          </View>
        )}
      </Card>

      <TextField
        label="Observacao (opcional)"
        value={observation}
        onChangeText={setObservation}
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {feedback && <Text style={{ color: colors.success }}>{feedback}</Text>}

      <Button label="CONFIRMAR ENTREGA" loading={submitting} disabled={!localUri} onPress={handleConfirm} />
      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}
