import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Button } from '../Button';
import { colors } from '../../theme/colors';
import { persistEvidenceFile } from '../../storage/evidenceFiles';

interface ChecklistPhotoFieldProps {
  label: string;
  localUri: string | null;
  syncStatus: 'pending' | 'synced' | null;
  disabled?: boolean;
  onCapture: (localUri: string) => void;
  onRemove: () => void;
}

// Fase 39, secao 12/30 -- expo-image-picker (camera nativa do SO) em vez de
// expo-camera: preview/aceitar/refazer ja vem prontos do sistema
// operacional, muito menos codigo que uma tela de camera customizada.
// quality:0.5 comprime a foto antes mesmo de sair do dispositivo (secao
// 30) -- sem biblioteca extra de compressao/resize.
export function ChecklistPhotoField({
  label,
  localUri,
  syncStatus,
  disabled = false,
  onCapture,
  onRemove,
}: ChecklistPhotoFieldProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTakePhoto(): Promise<void> {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Permissao de camera negada. Ative o acesso a camera nas configuracoes do celular.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (result.canceled || !result.assets?.[0]) return;

    setBusy(true);
    try {
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const persistedUri = await persistEvidenceFile(result.assets[0].uri, fileName);
      onCapture(persistedUri);
    } catch {
      setError('Nao foi possivel salvar a foto. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }} accessibilityLabel={`Campo de foto: ${label}`}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>

      {localUri && (
        <View style={{ gap: 8 }}>
          <Image
            source={{ uri: localUri }}
            style={{ width: 120, height: 120, borderRadius: 8 }}
            accessibilityLabel={`Foto capturada: ${label}`}
          />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {syncStatus === 'synced' ? '🟢 Sincronizado' : '🟡 Aguardando sincronizacao'}
          </Text>
          {!disabled && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Button label="Refazer" variant="secondary" loading={busy} onPress={handleTakePhoto} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Remover" variant="danger" onPress={onRemove} />
              </View>
            </View>
          )}
        </View>
      )}

      {/* Evidencia ja confirmada no servidor, mas sem copia local (ex:
          apos reabrir o app) -- sem endpoint de download nesta fase, so
          informa que ja foi enviada (ver EvidenceDraft.localUri). */}
      {!localUri && syncStatus === 'synced' && (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>🟢 Foto ja enviada anteriormente</Text>
      )}

      {!localUri && syncStatus !== 'synced' && (
        <Button label="Tirar foto" variant="secondary" loading={busy} disabled={disabled} onPress={handleTakePhoto} />
      )}

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
    </View>
  );
}
