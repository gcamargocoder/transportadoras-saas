import React from 'react';
import { Text, View } from 'react-native';
import { ChecklistItem } from '../../api/driverChecklist.types';
import { persistEvidenceBase64Png } from '../../storage/evidenceFiles';
import { colors } from '../../theme/colors';
import { Button } from '../Button';
import { TextField } from '../TextField';
import { ChecklistPhotoField } from './ChecklistPhotoField';
import { ChecklistSignaturePad } from './ChecklistSignaturePad';

export interface AnswerDraft {
  booleanValue?: boolean | undefined;
  textValue?: string | undefined;
  numberValue?: number | undefined;
  selectedValue?: string | undefined;
}

export interface EvidenceDraft {
  // null quando a evidencia ja existe no servidor (hidratada via GET, ex:
  // apos reabrir o app) mas o app nao tem mais o arquivo local -- nao ha
  // endpoint de download nesta fase (ver docs/checklist-module.md), entao
  // a UI mostra "ja enviada" em vez de tentar exibir uma imagem quebrada.
  localUri: string | null;
  syncStatus: 'pending' | 'synced';
}

interface ChecklistItemFieldProps {
  item: ChecklistItem;
  answer: AnswerDraft | undefined;
  evidence: EvidenceDraft | undefined;
  disabled: boolean;
  onAnswerChange: (value: AnswerDraft) => void;
  onEvidenceCapture: (localUri: string) => void;
  onEvidenceRemove: () => void;
}

// Fase 39, secao 7 -- so BOOLEAN e funcionalmente validado ponta a ponta no
// contrato atual (ver checklist-non-conformity.util.ts no backend); os
// demais tipos recebem suporte real mas basico (TEXT/NUMBER/SELECT como
// campo de texto simples -- o contrato ainda nao define um formato de
// "opcoes" para SELECT, entao inventar um select customizado aqui seria
// exatamente o hardcode que a fase probe). PHOTO/SIGNATURE disparam os
// componentes dedicados de evidencia.
export function ChecklistItemField({
  item,
  answer,
  evidence,
  disabled,
  onAnswerChange,
  onEvidenceCapture,
  onEvidenceRemove,
}: ChecklistItemFieldProps): React.JSX.Element {
  const showObservation = item.requiresObservation || answer?.booleanValue === false;

  // A assinatura sai do ChecklistSignaturePad como base64 puro (nao um
  // arquivo) -- persiste em disco AQUI (mesmo mecanismo de arquivo das
  // fotos) antes de notificar o pai, para que onEvidenceCapture tenha
  // sempre a MESMA forma (uma URI local persistida), nunca dois contratos
  // diferentes por tipo de item.
  async function handleSignatureConfirm(base64Png: string): Promise<void> {
    const fileName = `${item.id}-signature-${Date.now()}.png`;
    const localUri = await persistEvidenceBase64Png(base64Png, fileName);
    onEvidenceCapture(localUri);
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>
          {item.label}
          {item.required ? ' *' : ''}
        </Text>
        {item.critical && (
          <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '700' }}>CRITICO</Text>
        )}
      </View>
      {item.description && <Text style={{ color: colors.textMuted, fontSize: 13 }}>{item.description}</Text>}

      {item.type === 'BOOLEAN' && (
        <>
          <View style={{ flexDirection: 'row', gap: 12 }} accessibilityLabel={`Resposta: ${item.label}`}>
            <View style={{ flex: 1 }}>
              <Button
                label="SIM"
                variant={answer?.booleanValue === true ? 'primary' : 'secondary'}
                disabled={disabled}
                onPress={() => onAnswerChange({ ...answer, booleanValue: true })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="NAO"
                variant={answer?.booleanValue === false ? 'danger' : 'secondary'}
                disabled={disabled}
                onPress={() => onAnswerChange({ ...answer, booleanValue: false })}
              />
            </View>
          </View>
          {showObservation && (
            <TextField
              label="Descreva a situacao"
              value={answer?.textValue ?? ''}
              editable={!disabled}
              multiline
              onChangeText={(text) => onAnswerChange({ ...answer, textValue: text })}
            />
          )}
        </>
      )}

      {(item.type === 'TEXT' || item.type === 'SELECT') && (
        <TextField
          label={item.label}
          value={(item.type === 'SELECT' ? answer?.selectedValue : answer?.textValue) ?? ''}
          editable={!disabled}
          onChangeText={(text) =>
            onAnswerChange(item.type === 'SELECT' ? { ...answer, selectedValue: text } : { ...answer, textValue: text })
          }
        />
      )}

      {(item.type === 'NUMBER' || item.type === 'ODOMETER') && (
        <TextField
          label={item.label}
          value={answer?.numberValue !== undefined ? String(answer.numberValue) : ''}
          editable={!disabled}
          keyboardType="numeric"
          onChangeText={(text) => {
            const parsed = Number(text.replace(',', '.'));
            onAnswerChange({ ...answer, numberValue: Number.isFinite(parsed) && text !== '' ? parsed : undefined });
          }}
        />
      )}

      {item.type === 'PHOTO' && (
        <ChecklistPhotoField
          label={item.label}
          localUri={evidence?.localUri ?? null}
          syncStatus={evidence?.syncStatus ?? null}
          disabled={disabled}
          onCapture={onEvidenceCapture}
          onRemove={onEvidenceRemove}
        />
      )}

      {item.type === 'SIGNATURE' && !disabled && !evidence && (
        <ChecklistSignaturePad onConfirm={handleSignatureConfirm} />
      )}
      {item.type === 'SIGNATURE' && evidence && (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {evidence.syncStatus === 'synced' ? '🟢 Assinatura sincronizada' : '🟡 Assinatura aguardando sincronizacao'}
        </Text>
      )}
    </View>
  );
}
