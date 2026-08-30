import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as driverChecklistApi from '../api/driverChecklist.api';
import { ChecklistTemplate } from '../api/driverChecklist.types';
import { RootStackParamList } from '../navigation/types';
import { generateDeviceEventId } from '../storage/deviceEventId';
import { getActiveChecklistPointer, setActiveChecklistPointer } from '../storage/checklistPointer';
import { colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Checklist'>;

// Fase 39 -- ponto de entrada do checklist (pre ou pos-viagem). So trabalha
// com templates PUBLISHED (unico status que GET driver/checklists/available
// retorna, ver ChecklistTemplatesService.findPublishedForDriver) -- o
// motorista nunca ve/edita um DRAFT. A criacao da execucao e sempre ONLINE
// (decisao do plano da Fase 39): precisa do id gerado pelo servidor antes
// de abrir o formulario, ja que responder/enviar evidencia/concluir usam
// esse id na URL.
export function ChecklistScreen({ route, navigation }: Props): React.JSX.Element {
  const { tripId, type } = route.params;
  const [templates, setTemplates] = useState<ChecklistTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [pointer, all] = await Promise.all([
          getActiveChecklistPointer(tripId, type),
          driverChecklistApi.getAvailableChecklists(tripId),
        ]);
        if (cancelled) return;
        const filtered = all.filter((template) => template.type === type);
        setTemplates(filtered);

        // Ja existe uma execucao em andamento para esta viagem/tipo?
        // Retoma direto -- nunca deixa criar uma segunda por engano.
        if (pointer) {
          const template = filtered.find((candidate) => candidate.id === pointer.templateId);
          if (template) {
            navigation.replace('ChecklistExecution', { tripId, type, executionId: pointer.executionId, template });
          }
        }
      } catch {
        if (!cancelled) setError('Nao foi possivel carregar os checklists disponiveis. Verifique a conexao.');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [tripId, type, navigation]);

  async function handleSelect(template: ChecklistTemplate): Promise<void> {
    setCreatingId(template.id);
    setError(null);
    try {
      const position = await Location.getCurrentPositionAsync().catch(() => null);
      const execution = await driverChecklistApi.createChecklist({
        deviceEventId: generateDeviceEventId(),
        templateId: template.id,
        tripId,
        ...(position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : {}),
      });
      await setActiveChecklistPointer({ tripId, type, executionId: execution.id, templateId: template.id });
      navigation.replace('ChecklistExecution', { tripId, type, executionId: execution.id, template });
    } catch {
      setError('Sem conexao agora -- o checklist so pode ser iniciado com internet disponivel.');
    } finally {
      setCreatingId(null);
    }
  }

  if (!templates) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 80 }} />
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 20 }}>
        {type === 'PRE_TRIP' ? 'Checklist pre-viagem' : 'Checklist pos-viagem'}
      </Text>

      {templates.length === 0 && (
        <Card>
          <Text style={{ color: colors.textMuted }}>
            Nenhum modelo de checklist publicado para este tipo no momento.
          </Text>
        </Card>
      )}

      {templates.map((template) => (
        <Card key={template.id}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{template.name}</Text>
          <Button
            label="Iniciar"
            loading={creatingId === template.id}
            disabled={creatingId !== null}
            onPress={() => handleSelect(template)}
          />
        </Card>
      ))}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      <Button label="Voltar" variant="secondary" onPress={() => navigation.goBack()} />
    </ScreenContainer>
  );
}
