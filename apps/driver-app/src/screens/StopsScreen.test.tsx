import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React from 'react';
import * as driverTripsApi from '../api/driverTrips.api';
import { TripStop } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { StopsScreen } from './StopsScreen';

jest.mock('../api/driverTrips.api');
jest.mock('../storage/syncQueue');

const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;
const mockedSubmitOrQueue = submitOrQueue as jest.Mock;

function renderScreen() {
  const navigation = { goBack: jest.fn() };
  const route = { params: { tripId: 'trip-1' } };
  return render(<StopsScreen route={route as never} navigation={navigation as never} />);
}

// Fase 43 -- controle de paradas: selecao de motivo em 1 toque, abertura e
// fechamento offline-first via a mesma fila (syncQueue), e persistencia
// local (activeStopPointer/AsyncStorage) para sobreviver a app fechar/
// reabrir enquanto a abertura ainda nao sincronizou.
describe('StopsScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    api.getStops.mockResolvedValue([]);
    jest.spyOn(Location, 'getLastKnownPositionAsync').mockResolvedValue({
      coords: { latitude: -23.5, longitude: -46.6 },
    } as never);
  });

  it('exibe a grade de motivos quando nao ha parada em aberto', async () => {
    renderScreen();
    expect(await screen.findByText('Carregando')).toBeTruthy();
    expect(screen.getByText('Abastecimento')).toBeTruthy();
    expect(screen.queryByText('ENCERRAR PARADA')).toBeNull();
  });

  it('abrir (1 toque no motivo) envia stop-open com o tipo selecionado e mostra a parada em andamento', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    renderScreen();
    await screen.findByText('Carregando');

    fireEvent.press(screen.getByText('Abastecimento'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'stop-open', tripId: 'trip-1', type: 'FUEL', latitude: -23.5, longitude: -46.6 }),
      ),
    );
    expect(await screen.findByText('Parada em andamento: Abastecimento')).toBeTruthy();
    expect(screen.getByText('ENCERRAR PARADA')).toBeTruthy();
  });

  it('abertura offline: mostra aviso mas ainda assim marca a parada como em andamento (otimista)', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: true });
    renderScreen();
    await screen.findByText('Descanso');

    fireEvent.press(screen.getByText('Descanso'));

    expect(await screen.findByText(/Sem conexao agora/)).toBeTruthy();
    expect(screen.getByText('Parada em andamento: Descanso')).toBeTruthy();
  });

  it('encerrar envia stop-close com o MESMO deviceEventId usado na abertura', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    renderScreen();
    await screen.findByText('Refeicao');

    fireEvent.press(screen.getByText('Refeicao'));
    await screen.findByText('ENCERRAR PARADA');
    const openDeviceEventId = mockedSubmitOrQueue.mock.calls[0]![0].deviceEventId;

    fireEvent.press(screen.getByText('ENCERRAR PARADA'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'stop-close', tripId: 'trip-1', deviceEventId: openDeviceEventId }),
      ),
    );
    await waitFor(() => expect(screen.queryByText('ENCERRAR PARADA')).toBeNull());
  });

  it('reabrir a tela apos abertura offline (app fechado/reaberto) ainda mostra a parada em andamento', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: true });
    api.getStops.mockResolvedValue([]);
    const first = renderScreen();
    await screen.findByText('Manutencao');
    fireEvent.press(screen.getByText('Manutencao'));
    await screen.findByText('Parada em andamento: Manutencao');
    first.unmount();

    // Nova instancia da tela (simula reabrir o app) -- servidor ainda nao
    // sabe da parada (offline), mas o ponteiro local persistiu.
    renderScreen();
    expect(await screen.findByText('Parada em andamento: Manutencao')).toBeTruthy();
  });

  it('lista as paradas ja fechadas retornadas pelo servidor', async () => {
    const closedStop: TripStop = {
      id: 'stop-1',
      tripId: 'trip-1',
      type: 'YARD',
      latitude: -23.5,
      longitude: -46.6,
      startedAt: '2026-09-01T08:00:00.000Z',
      endedAt: '2026-09-01T08:30:00.000Z',
      durationMinutes: 30,
      locationLabel: null,
      syncStatus: 'SYNCED',
    };
    api.getStops.mockResolvedValue([closedStop]);

    renderScreen();

    expect(await screen.findByText('Duracao: 30 min')).toBeTruthy();
  });
});
