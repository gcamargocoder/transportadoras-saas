import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import * as driverChecklistApi from '../api/driverChecklist.api';
import { ChecklistExecution, ChecklistTemplate } from '../api/driverChecklist.types';
import * as checklistPointer from '../storage/checklistPointer';
import { submitOrQueue } from '../storage/syncQueue';
import { ChecklistExecutionScreen } from './ChecklistExecutionScreen';

jest.mock('../api/driverChecklist.api');
jest.mock('../storage/checklistPointer');
jest.mock('../storage/syncQueue');

// Mocka os componentes de evidencia no LIMITE (nao os internals de
// expo-image-picker/react-native-signature-canvas -- WebView nao roda no
// ambiente de teste) -- mesmo principio de mock de hook usado em
// HomeScreen.test.tsx.
jest.mock('../components/checklist/ChecklistPhotoField', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    ChecklistPhotoField: ({
      label,
      localUri,
      onCapture,
      onRemove,
    }: {
      label: string;
      localUri: string | null;
      onCapture: (uri: string) => void;
      onRemove: () => void;
    }) => (
      <View>
        <Text>{label}</Text>
        <Pressable onPress={() => onCapture('file:///mock/photo.jpg')}>
          <Text>{`MOCK_CAPTURAR:${label}`}</Text>
        </Pressable>
        {localUri && (
          <Pressable onPress={onRemove}>
            <Text>{`MOCK_REMOVER:${label}`}</Text>
          </Pressable>
        )}
      </View>
    ),
  };
});
jest.mock('../components/checklist/ChecklistSignaturePad', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    ChecklistSignaturePad: ({ onConfirm }: { onConfirm: (base64: string) => void }) => (
      <Pressable onPress={() => onConfirm('base64signature')}>
        <Text>MOCK_CONFIRMAR_ASSINATURA</Text>
      </Pressable>
    ),
  };
});

const api = driverChecklistApi as jest.Mocked<typeof driverChecklistApi>;
const pointer = checklistPointer as jest.Mocked<typeof checklistPointer>;
const mockedSubmitOrQueue = submitOrQueue as jest.Mock;

const TEMPLATE: ChecklistTemplate = {
  id: 'template-1',
  name: 'Sider Pre-Viagem',
  type: 'PRE_TRIP',
  version: 1,
  sections: [
    {
      id: 'section-1',
      title: 'SEGURANCA',
      order: 1,
      items: [
        {
          id: 'item-cinto',
          code: 'cinto',
          label: 'Cinto de seguranca',
          description: null,
          type: 'BOOLEAN',
          required: true,
          order: 1,
          critical: true,
          requiresObservation: false,
          requiresPhoto: false,
        },
      ],
    },
    {
      id: 'section-2',
      title: 'PNEUS',
      order: 2,
      items: [
        {
          id: 'item-foto',
          code: 'foto_eixo_1',
          label: 'Foto eixo 1',
          description: null,
          type: 'PHOTO',
          required: false,
          order: 1,
          critical: false,
          requiresObservation: false,
          requiresPhoto: true,
        },
      ],
    },
  ],
};

const EMPTY_EXECUTION: ChecklistExecution = {
  id: 'exec-1',
  templateId: 'template-1',
  templateVersion: 1,
  tripId: 'trip-1',
  status: 'IN_PROGRESS',
  startedAt: '2026-08-11T10:00:00.000Z',
  completedAt: null,
  odometerKm: null,
  hasCriticalNonConformity: false,
  answers: [],
  evidence: [],
};

function renderScreen() {
  const navigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
  const route = { params: { tripId: 'trip-1', type: 'PRE_TRIP' as const, executionId: 'exec-1', template: TEMPLATE } };
  const utils = render(<ChecklistExecutionScreen route={route as never} navigation={navigation as never} />);
  return { ...utils, navigation };
}

// Fase 39 -- ChecklistExecutionScreen (formulario dinamico). O acoplamento
// com submitOrQueue/syncQueue ja e coberto a fundo em syncQueue.test.ts --
// aqui o foco e comportamento observavel do formulario (renderizacao,
// validacao, evidencia, resumo, conclusao), nao o mecanismo de fila.
describe('ChecklistExecutionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getChecklist.mockResolvedValue(EMPTY_EXECUTION);
    pointer.clearActiveChecklistPointer.mockResolvedValue(undefined);
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
  });

  it('renderiza sections e items dinamicamente a partir do template (nenhum item hardcoded)', async () => {
    renderScreen();

    expect(await screen.findByText('SEGURANCA')).toBeTruthy();
    expect(screen.getByText('Cinto de seguranca *')).toBeTruthy();
    expect(screen.getByText('PNEUS')).toBeTruthy();
    expect(screen.getAllByText('Foto eixo 1').length).toBeGreaterThan(0);
  });

  it('item obrigatorio sem resposta mantem o botao de concluir desabilitado', async () => {
    renderScreen();
    await screen.findByText('SEGURANCA');

    expect(screen.getByText(/1 item\(ns\) obrigatorio\(s\) sem resposta/)).toBeTruthy();
    fireEvent.press(screen.getByText('CONCLUIR CHECKLIST'));
    expect(mockedSubmitOrQueue).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'checklist-complete' }));
  });

  it('responder SIM atualiza o contador do resumo e nao mostra observacao', async () => {
    renderScreen();
    await screen.findByText('SEGURANCA');

    fireEvent.press(screen.getByText('SIM'));

    await waitFor(() => expect(screen.getByText('2 itens -- 1 respondidos')).toBeTruthy());
    expect(screen.queryByLabelText('Descreva a situacao')).toBeNull();
  });

  it('responder NAO em item critico mostra campo de observacao e nao-conformidade no resumo', async () => {
    renderScreen();
    await screen.findByText('SEGURANCA');

    fireEvent.press(screen.getByText('NAO'));

    await waitFor(() => expect(screen.getByLabelText('Descreva a situacao')).toBeTruthy());
    expect(screen.getByText(/ATENCAO: existem 1 item\(ns\) critico\(s\) marcado\(s\) como NAO/)).toBeTruthy();
  });

  it('item com foto obrigatoria sem evidencia bloqueia a conclusao', async () => {
    renderScreen();
    await screen.findByText('PNEUS');

    expect(screen.getByText(/1 item\(ns\) sem a foto exigida/)).toBeTruthy();
  });

  it('capturar a foto do item associa a evidencia (fila offline) e libera a exigencia de foto', async () => {
    renderScreen();
    await screen.findByText('PNEUS');

    fireEvent.press(screen.getByText('MOCK_CAPTURAR:Foto eixo 1'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'checklist-evidence', itemId: 'item-foto', localFileUri: 'file:///mock/photo.jpg' }),
      ),
    );
    expect(screen.queryByText(/item\(ns\) sem a foto exigida/)).toBeNull();
  });

  it('remover a foto capturada volta a exigir evidencia', async () => {
    renderScreen();
    await screen.findByText('PNEUS');
    fireEvent.press(screen.getByText('MOCK_CAPTURAR:Foto eixo 1'));
    await waitFor(() => expect(screen.getByText('MOCK_REMOVER:Foto eixo 1')).toBeTruthy());

    fireEvent.press(screen.getByText('MOCK_REMOVER:Foto eixo 1'));

    expect(screen.getByText(/1 item\(ns\) sem a foto exigida/)).toBeTruthy();
  });

  it('preenchendo item obrigatorio e a foto exigida, conclui com sucesso', async () => {
    const { navigation } = renderScreen();
    await screen.findByText('SEGURANCA');

    fireEvent.press(screen.getByText('SIM'));
    fireEvent.press(screen.getByText('MOCK_CAPTURAR:Foto eixo 1'));
    await waitFor(() => expect(screen.getByText('2 itens -- 2 respondidos')).toBeTruthy());

    fireEvent.press(screen.getByText('CONCLUIR CHECKLIST'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'checklist-complete', executionId: 'exec-1' })),
    );
    expect(pointer.clearActiveChecklistPointer).toHaveBeenCalledWith('trip-1', 'PRE_TRIP');
    expect(await screen.findByText('CHECKLIST CONCLUIDO')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled(); // permanece na tela mostrando o estado concluido
  });

  it('execucao ja COMPLETED (hidratada do servidor) abre em modo somente-leitura, sem botao de concluir', async () => {
    api.getChecklist.mockResolvedValue({
      ...EMPTY_EXECUTION,
      status: 'COMPLETED',
      completedAt: '2026-08-11T11:00:00.000Z',
      answers: [
        {
          id: 'answer-1',
          itemId: 'item-cinto',
          booleanValue: true,
          textValue: null,
          numberValue: null,
          selectedValue: null,
          evidence: [],
        },
      ],
    });
    renderScreen();

    expect(await screen.findByText('CHECKLIST CONCLUIDO')).toBeTruthy();
    expect(screen.queryByText('CONCLUIR CHECKLIST')).toBeNull();
  });

  it('sem conexao ao carregar a execucao ainda abre o formulario (estrutura ja veio do template)', async () => {
    api.getChecklist.mockRejectedValue(new Error('network down'));
    renderScreen();

    expect(await screen.findByText('SEGURANCA')).toBeTruthy();
    expect(screen.getByText(/Sem conexao/)).toBeTruthy();
  });
});
