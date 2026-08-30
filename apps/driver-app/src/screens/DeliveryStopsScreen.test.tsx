import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

// Ambiente deste monorepo e mais lento que o default de 1000ms do RNTL para
// findBy*/waitFor (mesmos sintomas ja observados em outras suites pesadas
// do driver-app) -- eleva so para ESTA suite, nao um comportamento novo do
// componente.
configure({ asyncUtilTimeout: 5000 });
import * as driverTripsApi from '../api/driverTrips.api';
import { TripDeliveryStop } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { DeliveryStopsScreen } from './DeliveryStopsScreen';

jest.mock('../api/driverTrips.api');
jest.mock('../storage/syncQueue');

const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;
const mockedSubmitOrQueue = submitOrQueue as jest.Mock;

function buildStop(overrides: Partial<TripDeliveryStop> = {}): TripDeliveryStop {
  return {
    id: 'stop-1',
    tripId: 'trip-1',
    sequence: 1,
    customerId: 'customer-1',
    customerName: 'Industria ABC',
    locationId: 'location-1',
    locationName: 'Galpao 3',
    locationAddress: 'Rua das Industrias, 100',
    status: 'PENDING',
    plannedArrival: '2026-09-01T14:00:00.000Z',
    actualArrival: null,
    deliveredAt: null,
    failureReason: null,
    notes: null,
    ...overrides,
  };
}

function renderScreen() {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const route = { params: { tripId: 'trip-1' } };
  const utils = render(<DeliveryStopsScreen route={route as never} navigation={navigation as never} />);
  return { ...utils, navigation };
}

// Fase 106 -- fecha a lacuna real de escrita: ate aqui o Driver App so LIA
// TripDeliveryStop (Fase 88), a mudanca de status era exclusiva do painel
// administrativo. Cobre as transicoes principais via a MESMA fila offline
// (syncQueue) ja usada pelo resto do app, e o encadeamento com o comprovante
// de entrega vinculado a uma parada especifica (Fase 100/106).
describe('DeliveryStopsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista as entregas planejadas com status', async () => {
    api.getDeliveryStops.mockResolvedValue([buildStop()]);
    renderScreen();

    expect(await screen.findByText('1. Galpao 3')).toBeTruthy();
    expect(screen.getByText('Industria ABC')).toBeTruthy();
    expect(screen.getByText('Pendente')).toBeTruthy();
  });

  it('estado vazio quando a viagem nao tem entregas planejadas', async () => {
    api.getDeliveryStops.mockResolvedValue([]);
    renderScreen();

    expect(await screen.findByText('Nenhuma entrega planejada para esta viagem.')).toBeTruthy();
  });

  it('PENDING -> IN_PROGRESS: envia delivery-stop-status via fila e recarrega a lista quando online', async () => {
    api.getDeliveryStops.mockResolvedValue([buildStop()]);
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    renderScreen();
    await screen.findByText('1. Galpao 3');

    fireEvent.press(screen.getByText('INICIAR ENTREGA'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith({
        kind: 'delivery-stop-status',
        tripId: 'trip-1',
        stopId: 'stop-1',
        status: 'IN_PROGRESS',
      }),
    );
    // Confirmado pelo servidor -- recarrega a lista (2a chamada a getDeliveryStops).
    await waitFor(() => expect(api.getDeliveryStops).toHaveBeenCalledTimes(2));
  });

  it('IN_PROGRESS -> COMPLETED: mostra acao de anexar comprovante apos concluir', async () => {
    api.getDeliveryStops.mockResolvedValueOnce([buildStop({ status: 'IN_PROGRESS' })]);
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    api.getDeliveryStops.mockResolvedValueOnce([buildStop({ status: 'COMPLETED', deliveredAt: '2026-09-01T14:05:00.000Z' })]);
    renderScreen();
    await screen.findByText('CONCLUIR ENTREGA');

    fireEvent.press(screen.getByText('CONCLUIR ENTREGA'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'delivery-stop-status', status: 'COMPLETED' }),
      ),
    );
    expect(await screen.findByText('Anexar comprovante')).toBeTruthy();
  });

  it('navega para DeliveryProof com o vinculo da parada ao tocar em "Anexar comprovante"', async () => {
    api.getDeliveryStops.mockResolvedValue([buildStop({ status: 'COMPLETED' })]);
    const { navigation } = renderScreen();
    await screen.findByText('Anexar comprovante');

    fireEvent.press(screen.getByText('Anexar comprovante'));

    expect(navigation.navigate).toHaveBeenCalledWith('DeliveryProof', {
      tripId: 'trip-1',
      tripDeliveryStopId: 'stop-1',
      stopLabel: '1. Galpao 3',
    });
  });

  it('registrar falha exige motivo antes de confirmar', async () => {
    api.getDeliveryStops.mockResolvedValue([buildStop()]);
    renderScreen();
    await screen.findByText('1. Galpao 3');

    fireEvent.press(screen.getByText('Falha'));
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    // Botao desabilitado sem motivo preenchido -- Pressable.disabled ignora
    // o press, entao onPress nunca dispara (mesmo padrao ja usado em
    // DeliveryProofScreen.test.tsx para "nao permite confirmar sem foto").
    fireEvent.press(screen.getByText('CONFIRMAR FALHA'));
    expect(mockedSubmitOrQueue).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('Motivo da falha'), 'Endereco nao encontrado');
    fireEvent.press(screen.getByText('CONFIRMAR FALHA'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith({
        kind: 'delivery-stop-status',
        tripId: 'trip-1',
        stopId: 'stop-1',
        status: 'FAILED',
        reason: 'Endereco nao encontrado',
      }),
    );
  });

  it('offline: mostra aviso e atualiza o status localmente sem recarregar a lista (fica pendente de sincronizacao)', async () => {
    api.getDeliveryStops.mockResolvedValue([buildStop()]);
    mockedSubmitOrQueue.mockResolvedValue({ queued: true });
    renderScreen();
    await screen.findByText('1. Galpao 3');
    expect(api.getDeliveryStops).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText('INICIAR ENTREGA'));

    expect(await screen.findByText(/Sem conexao agora/)).toBeTruthy();
    // Atualizacao otimista local -- some o botao PENDING, aparece o de IN_PROGRESS.
    expect(await screen.findByText('CONCLUIR ENTREGA')).toBeTruthy();
    // Nunca refaz o GET quando offline (evitaria sobrescrever com uma lista vazia/stale).
    expect(api.getDeliveryStops).toHaveBeenCalledTimes(1);
  });
});
