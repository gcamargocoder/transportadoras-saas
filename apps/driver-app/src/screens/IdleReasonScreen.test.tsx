import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverIdlePeriod } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { IdleReasonScreen } from './IdleReasonScreen';

jest.mock('../api/driverTrips.api');
jest.mock('../storage/syncQueue');

const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;
const mockedSubmitOrQueue = submitOrQueue as jest.Mock;

const OPEN_PERIOD: DriverIdlePeriod = {
  id: 'idle-1',
  vehicleId: 'veh-1',
  plate: 'ABC1D23',
  startedAt: '2026-09-01T09:00:00.000Z',
  endedAt: null,
  durationMinutes: null,
  reason: 'AGUARDANDO_ORDEM',
  source: 'AUTO',
  previousDestinationLabel: 'São Paulo/SP',
  status: 'OPEN',
};

function renderScreen() {
  const navigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
  const route = { params: undefined };
  const utils = render(<IdleReasonScreen route={route as never} navigation={navigation as never} />);
  return { ...utils, navigation };
}

// Fase C -- tela pos-viagem "Finalizar operacao": o motorista so confirma/
// altera o MOTIVO do VehicleIdlePeriod ja ABERTO pela Fase B. Nunca cria/
// fecha periodo, nunca envia duracao/datas.
describe('IdleReasonScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getCurrentIdlePeriod.mockResolvedValue(OPEN_PERIOD);
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
  });

  it('carrega o periodo aberto e pre-seleciona o motivo atual', async () => {
    renderScreen();

    expect(await screen.findByText('ABC1D23')).toBeTruthy();
    expect(screen.getByText('São Paulo/SP')).toBeTruthy();
    // o motivo atual do periodo ja vem marcado -- confirmar sem trocar nada
    // reenvia o mesmo motivo (idempotente por estado).
    fireEvent.press(screen.getByText('CONFIRMAR MOTIVO'));
    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith({ kind: 'idle-reason', reason: 'AGUARDANDO_ORDEM' }),
    );
  });

  it('selecionar outro motivo e confirmar enfileira/eNVIA idle-reason com o novo motivo e volta para a Home', async () => {
    const { navigation } = renderScreen();
    await screen.findByText('ABC1D23');

    fireEvent.press(screen.getByText('Manutenção'));
    fireEvent.press(screen.getByText('CONFIRMAR MOTIVO'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith({ kind: 'idle-reason', reason: 'MANUTENCAO' }),
    );
    expect(navigation.replace).toHaveBeenCalledWith('Home');
  });

  it('offline: submitOrQueue devolve queued=true -> mostra aviso e ainda navega para Home', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: true });
    const { navigation } = renderScreen();
    await screen.findByText('ABC1D23');

    fireEvent.press(screen.getByText('Pátio'));
    fireEvent.press(screen.getByText('CONFIRMAR MOTIVO'));

    expect(await screen.findByText(/Sem conexão agora/i)).toBeTruthy();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('Home'));
  });

  it('cancelar volta sem enviar nada (mantem o default automatico)', async () => {
    const { navigation } = renderScreen();
    await screen.findByText('ABC1D23');

    fireEvent.press(screen.getByText('Cancelar'));

    expect(navigation.goBack).toHaveBeenCalled();
    expect(mockedSubmitOrQueue).not.toHaveBeenCalled();
  });

  it('sem periodo aberto: mostra o aviso e nao oferece o formulario de motivo', async () => {
    api.getCurrentIdlePeriod.mockResolvedValue(null);
    renderScreen();

    expect(
      await screen.findByText(/Nenhum período de parada em aberto para o seu veículo/i),
    ).toBeTruthy();
    expect(screen.queryByText('CONFIRMAR MOTIVO')).toBeNull();
  });

  it('falha ao carregar o periodo nao trava a tela (cai no estado "sem periodo")', async () => {
    api.getCurrentIdlePeriod.mockRejectedValue(new Error('network down'));
    renderScreen();

    expect(
      await screen.findByText(/Nenhum período de parada em aberto para o seu veículo/i),
    ).toBeTruthy();
  });

  it('nunca chama uma API de duracao/datas -- so getCurrentIdlePeriod na carga e submitOrQueue idle-reason no confirmar', async () => {
    renderScreen();
    await screen.findByText('ABC1D23');
    fireEvent.press(screen.getByText('Descanso'));
    fireEvent.press(screen.getByText('CONFIRMAR MOTIVO'));

    await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
    expect(api.setIdleReason).not.toHaveBeenCalled();
    expect(api.completeTrip).not.toHaveBeenCalled();
    const payload = mockedSubmitOrQueue.mock.calls[0]![0];
    expect(Object.keys(payload).sort()).toEqual(['kind', 'reason']);
  });
});
