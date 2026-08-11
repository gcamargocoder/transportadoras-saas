import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { AnswerDraft, ChecklistItemField, EvidenceDraft } from '../components/checklist/ChecklistItemField';
import * as driverChecklistApi from '../api/driverChecklist.api';
import { ChecklistAnswerInput, ChecklistExecution, ChecklistItem } from '../api/driverChecklist.types';
import { RootStackParamList } from '../navigation/types';
import { clearActiveChecklistPointer } from '../storage/checklistPointer';
import { generateDeviceEventId } from '../storage/deviceEventId';
import { deleteEvidenceFile } from '../storage/evidenceFiles';
import { submitOrQueue } from '../storage/syncQueue';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ChecklistExecution'>;

const ANSWER_SAVE_DEBOUNCE_MS = 1200;

function hasAnswerValue(answer: AnswerDraft | undefined): boolean {
  if (!answer) return false;
  return (
    answer.booleanValue !== undefined ||
    (answer.textValue !== undefined && answer.textValue !== '') ||
    answer.numberValue !== undefined ||
    (answer.selectedValue !== undefined && answer.selectedValue !== '')
  );
}

function toAnswerInput(itemId: string, answer: AnswerDraft): ChecklistAnswerInput {
  return { itemId, ...answer };
}

// Fase 39 -- formulario dinamico do checklist. Renderiza sections/items a
// partir do ChecklistTemplate ja carregado pela ChecklistScreen (nunca um
// segundo GET so para o template). Sem tela de revisao separada: o resumo
// (respostas/nao-conformidades/fotos) e o botao de conclusao ficam no
// rodape desta mesma tela, atualizando ao vivo (secao 20/24 da Fase 39 --
// poucos toques, sem navegacao extra).
export function ChecklistExecutionScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId, type, executionId, template } = route.params;

  const items = useMemo<ChecklistItem[]>(
    () => template.sections.flatMap((section) => section.items),
    [template],
  );
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ChecklistExecution['status']>('IN_PROGRESS');
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({});
  const [evidenceByItem, setEvidenceByItem] = useState<Record<string, EvidenceDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushAnswers = useCallback(async (): Promise<void> => {
    const entries = Object.entries(answersRef.current).filter(([, value]) => hasAnswerValue(value));
    if (entries.length === 0) return;
    const result = await submitOrQueue({
      kind: 'checklist-answers',
      executionId,
      answers: entries.map(([itemId, value]) => toAnswerInput(itemId, value)),
    });
    setSyncNotice(result.queued ? 'Sem conexao agora -- as respostas serao sincronizadas automaticamente.' : null);
  }, [executionId]);

  // Carrega o estado real da execucao (fonte de verdade e sempre o
  // servidor -- secao 42). Se offline no primeiro acesso, o formulario
  // ainda abre (a estrutura do template ja veio via route.params), so sem
  // hidratar respostas/evidencias ja sincronizadas antes.
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const execution = await driverChecklistApi.getChecklist(executionId);
        if (cancelled) return;
        setStatus(execution.status);
        const nextAnswers: Record<string, AnswerDraft> = {};
        for (const answer of execution.answers) {
          nextAnswers[answer.itemId] = {
            ...(answer.booleanValue !== null ? { booleanValue: answer.booleanValue } : {}),
            ...(answer.textValue !== null ? { textValue: answer.textValue } : {}),
            ...(answer.numberValue !== null ? { numberValue: answer.numberValue } : {}),
            ...(answer.selectedValue !== null ? { selectedValue: answer.selectedValue } : {}),
          };
        }
        setAnswers(nextAnswers);
        const nextEvidence: Record<string, EvidenceDraft> = {};
        for (const evidence of execution.evidence) {
          if (evidence.itemId) {
            nextEvidence[evidence.itemId] = { localUri: '', syncStatus: 'synced' };
          }
        }
        setEvidenceByItem(nextEvidence);
      } catch {
        if (!cancelled) setSyncNotice('Sem conexao -- exibindo o formulario com o ultimo estado conhecido localmente.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [executionId]);

  // Flush ao sair da tela -- nunca perde uma resposta digitada nos ultimos
  // ANSWER_SAVE_DEBOUNCE_MS antes do motorista apertar "Voltar".
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        void flushAnswers();
      }
    };
  }, [flushAnswers]);

  function handleAnswerChange(itemId: string, value: AnswerDraft): void {
    setAnswers((prev) => ({ ...prev, [itemId]: value }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void flushAnswers();
    }, ANSWER_SAVE_DEBOUNCE_MS);
  }

  async function handleEvidenceCapture(item: ChecklistItem, localUri: string): Promise<void> {
    setEvidenceByItem((prev) => ({ ...prev, [item.id]: { localUri, syncStatus: 'pending' } }));
    const deviceEventId = generateDeviceEventId();
    const fileName = localUri.split('/').pop() ?? `${deviceEventId}.jpg`;
    const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
    // Assinatura (SIGNATURE) e sempre categorizada como SIGNATURE; qualquer
    // outro item PHOTO usa GENERAL -- o template nao carrega metadado
    // suficiente para distinguir eixo 1/2/3/odometro sem adivinhar por
    // nome do item (o que seria exatamente o hardcode que a fase probe).
    const evidenceType = item.type === 'SIGNATURE' ? 'SIGNATURE' : 'GENERAL';
    const result = await submitOrQueue({
      kind: 'checklist-evidence',
      executionId,
      deviceEventId,
      type: evidenceType,
      itemId: item.id,
      localFileUri: localUri,
      fileName,
      mimeType,
    });
    setEvidenceByItem((prev) => ({
      ...prev,
      [item.id]: { localUri, syncStatus: result.queued ? 'pending' : 'synced' },
    }));
    if (result.queued) {
      setSyncNotice('Sem conexao agora -- a evidencia sera sincronizada automaticamente.');
    }
    // Para BOOLEAN/PHOTO/SIGNATURE combinados, marca o item como
    // "respondido" (o conteudo real e a evidencia, ver docs/checklist-module.md).
    handleAnswerChange(item.id, { booleanValue: true });
  }

  async function handleEvidenceRemove(item: ChecklistItem): Promise<void> {
    const current = evidenceByItem[item.id];
    setEvidenceByItem((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    if (current?.localUri) {
      await deleteEvidenceFile(current.localUri).catch(() => undefined);
    }
  }

  const requiredMissing = items.filter((item) => item.required && !hasAnswerValue(answers[item.id])).length;
  const photoMissing = items.filter((item) => item.requiresPhoto && !evidenceByItem[item.id]).length;
  const nonConformities = items.filter(
    (item) => item.type === 'BOOLEAN' && item.critical && answers[item.id]?.booleanValue === false,
  ).length;
  const photosCount = Object.keys(evidenceByItem).length;
  const isCompleted = status === 'COMPLETED';
  const canComplete = !isCompleted && requiredMissing === 0 && photoMissing === 0 && !completing;

  async function handleComplete(): Promise<void> {
    setCompleting(true);
    setError(null);
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await flushAnswers();
      const result = await submitOrQueue({ kind: 'checklist-complete', executionId });
      if (result.queued) {
        setSyncNotice('Sem conexao agora -- a conclusao sera sincronizada automaticamente.');
      } else {
        setSyncNotice(null);
      }
      await clearActiveChecklistPointer(tripId, type);
      setStatus('COMPLETED');
    } catch {
      setError('Nao foi possivel concluir o checklist. Tente novamente.');
    } finally {
      setCompleting(false);
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 20 }}>{template.name}</Text>
      {isCompleted && (
        <Card style={{ borderColor: colors.success }}>
          <Text style={{ color: colors.success, fontWeight: '700' }}>CHECKLIST CONCLUIDO</Text>
          <Text style={{ color: colors.textMuted }}>Este checklist nao pode mais ser alterado.</Text>
        </Card>
      )}

      {template.sections.map((section) => (
        <Card key={section.id}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{section.title}</Text>
          {section.items.map((item) => (
            <ChecklistItemField
              key={item.id}
              item={item}
              answer={answers[item.id]}
              evidence={evidenceByItem[item.id]}
              disabled={isCompleted}
              onAnswerChange={(value) => handleAnswerChange(item.id, value)}
              onEvidenceCapture={(localUri) => void handleEvidenceCapture(item, localUri)}
              onEvidenceRemove={() => void handleEvidenceRemove(item)}
            />
          ))}
        </Card>
      ))}

      <Card>
        <Text style={{ color: colors.text, fontWeight: '700' }}>Resumo</Text>
        <Text style={{ color: colors.textMuted }}>
          {items.length} itens -- {Object.keys(answers).length} respondidos
        </Text>
        {nonConformities > 0 && (
          <Text style={{ color: colors.warning, fontWeight: '600' }}>
            ATENCAO: existem {nonConformities} item(ns) critico(s) marcado(s) como NAO.
          </Text>
        )}
        <Text style={{ color: colors.textMuted }}>{photosCount} evidencia(s) anexada(s)</Text>
        {requiredMissing > 0 && (
          <Text style={{ color: colors.danger }}>{requiredMissing} item(ns) obrigatorio(s) sem resposta.</Text>
        )}
        {photoMissing > 0 && <Text style={{ color: colors.danger }}>{photoMissing} item(ns) sem a foto exigida.</Text>}
      </Card>

      {syncNotice && <Text style={{ color: colors.textMuted }}>{syncNotice}</Text>}
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}

      {!isCompleted && (
        <Button label="CONCLUIR CHECKLIST" loading={completing} disabled={!canComplete} onPress={handleComplete} />
      )}
      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}
