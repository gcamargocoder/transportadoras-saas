import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import * as driverChecklistApi from '../api/driverChecklist.api';
import { ChecklistTemplate } from '../api/driverChecklist.types';
import * as checklistPointer from '../storage/checklistPointer';
import { ChecklistScreen } from './ChecklistScreen';

jest.mock('../api/driverChecklist.api');
jest.mock('../storage/checklistPointer');

const api = driverChecklistApi as jest.Mocked<typeof driverChecklistApi>;
const pointer = checklistPointer as jest.Mocked<typeof checklistPointer>;

const PRE_TRIP_TEMPLATE: ChecklistTemplate = {
  id: 'template-1',
  name: 'Sider Pre-Viagem',
  type: 'PRE_TRIP',
  version: 1,
  sections: [],
};

const POST_TRIP_TEMPLATE: ChecklistTemplate = {
  id: 'template-2',
  name: 'Sider Pos-Viagem',
  type: 'POST_TRIP',
  version: 1,
  sections: [],
};

function renderScreen(type: 'PRE_TRIP' | 'POST_TRIP' = 'PRE_TRIP') {
  const navigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
  const route = { params: { tripId: 'trip-1', type } };
  const utils = render(<ChecklistScreen route={route as never} navigation={navigation as never} />);
  return { ...utils, navigation };
}

// Fase 39 -- ChecklistScreen (selecao/criacao do checklist).
describe('ChecklistScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pointer.getActiveChecklistPointer.mockResolvedValue(null);
    pointer.setActiveChecklistPointer.mockResolvedValue(undefined);
    api.getAvailableChecklists.mockResolvedValue([PRE_TRIP_TEMPLATE, POST_TRIP_TEMPLATE]);
  });

  it('carrega e filtra os templates pelo tipo pedido (PRE_TRIP)', async () => {
    renderScreen('PRE_TRIP');

    expect(await screen.findByText('Sider Pre-Viagem')).toBeTruthy();
    expect(screen.queryByText('Sider Pos-Viagem')).toBeNull();
  });

  it('carrega e filtra os templates pelo tipo pedido (POST_TRIP)', async () => {
    renderScreen('POST_TRIP');

    expect(await screen.findByText('Sider Pos-Viagem')).toBeTruthy();
    expect(screen.queryByText('Sider Pre-Viagem')).toBeNull();
  });

  // Fase 111 -- getAvailableChecklists agora recebe tripId (backend filtra
  // por vehicleType/trailerType da composicao daquela viagem).
  it('chama getAvailableChecklists com o tripId da rota', async () => {
    renderScreen('PRE_TRIP');

    await screen.findByText('Sider Pre-Viagem');
    expect(api.getAvailableChecklists).toHaveBeenCalledWith('trip-1');
  });

  it('mostra mensagem quando nao ha template publicado para o tipo', async () => {
    api.getAvailableChecklists.mockResolvedValue([]);
    renderScreen('PRE_TRIP');

    expect(await screen.findByText(/Nenhum modelo de checklist publicado/)).toBeTruthy();
  });

  it('erro de rede ao carregar templates mostra mensagem clara', async () => {
    api.getAvailableChecklists.mockRejectedValue(new Error('network down'));
    renderScreen('PRE_TRIP');

    expect(await screen.findByText(/Nao foi possivel carregar os checklists/)).toBeTruthy();
  });

  it('iniciar um template cria a execucao ONLINE e navega para o formulario', async () => {
    api.createChecklist.mockResolvedValue({
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
    });
    const { navigation } = renderScreen('PRE_TRIP');
    await screen.findByText('Sider Pre-Viagem');

    fireEvent.press(screen.getByText('Iniciar'));

    await waitFor(() => expect(api.createChecklist).toHaveBeenCalledTimes(1));
    expect(api.createChecklist).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'template-1', tripId: 'trip-1' }),
    );
    expect(pointer.setActiveChecklistPointer).toHaveBeenCalledWith({
      tripId: 'trip-1',
      type: 'PRE_TRIP',
      executionId: 'exec-1',
      templateId: 'template-1',
    });
    expect(navigation.replace).toHaveBeenCalledWith('ChecklistExecution', {
      tripId: 'trip-1',
      type: 'PRE_TRIP',
      executionId: 'exec-1',
      template: PRE_TRIP_TEMPLATE,
    });
  });

  it('sem conexao ao criar a execucao mostra erro claro e nao navega', async () => {
    api.createChecklist.mockRejectedValue(new Error('network down'));
    const { navigation } = renderScreen('PRE_TRIP');
    await screen.findByText('Sider Pre-Viagem');

    fireEvent.press(screen.getByText('Iniciar'));

    expect(await screen.findByText(/Sem conexao agora/)).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('execucao ja em andamento (ponteiro local) retoma direto, sem criar uma nova', async () => {
    pointer.getActiveChecklistPointer.mockResolvedValue({
      tripId: 'trip-1',
      type: 'PRE_TRIP',
      executionId: 'exec-existing',
      templateId: 'template-1',
    });
    const { navigation } = renderScreen('PRE_TRIP');

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('ChecklistExecution', {
        tripId: 'trip-1',
        type: 'PRE_TRIP',
        executionId: 'exec-existing',
        template: PRE_TRIP_TEMPLATE,
      }),
    );
    expect(api.createChecklist).not.toHaveBeenCalled();
  });
});
