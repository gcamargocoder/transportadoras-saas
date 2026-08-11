import React, { useRef } from 'react';
import { View } from 'react-native';
import SignatureView, { SignatureViewRef } from 'react-native-signature-canvas';
import { Button } from '../Button';
import { colors } from '../../theme/colors';

interface ChecklistSignaturePadProps {
  onConfirm: (base64Png: string) => void;
}

const DATA_URL_PREFIX = /^data:image\/png;base64,/;

// Fase 39, secao 15 -- assinatura desenhada de verdade (nunca texto
// digitado como substituicao). react-native-signature-canvas e a lib
// padrao do ecossistema Expo/RN (WebView + canvas HTML por baixo, ja
// trazida como peer dependency react-native-webview).
export function ChecklistSignaturePad({ onConfirm }: ChecklistSignaturePadProps): React.JSX.Element {
  const ref = useRef<SignatureViewRef>(null);

  function handleOK(signature: string): void {
    onConfirm(signature.replace(DATA_URL_PREFIX, ''));
  }

  return (
    <View
      style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}
      accessibilityLabel="Area de assinatura do motorista"
    >
      <View style={{ height: 260 }}>
        <SignatureView
          ref={ref}
          onOK={handleOK}
          webStyle=".m-signature-pad--footer { display: none; margin: 0; } body,html { background-color: transparent; }"
          backgroundColor={colors.surface}
          penColor={colors.text}
          descriptionText=""
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 12, padding: 12, backgroundColor: colors.background }}>
        <View style={{ flex: 1 }}>
          <Button label="Limpar" variant="secondary" onPress={() => ref.current?.clearSignature()} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Confirmar assinatura" onPress={() => ref.current?.readSignature()} />
        </View>
      </View>
    </View>
  );
}
