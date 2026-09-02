import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import React from 'react';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverTrip } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { FinishTripScreen } from './FinishTripScreen';

jest.mock('../api/driverTrips.api');
jest.mock('../storage/syncQueue');

const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;
const mockedSubmitOrQueue = submitOrQueue as jest.Mock;

const TRIP: DriverTrip = {
  id: 'trip-1',
  destinationName: 'São Paulo/SP',
  originName: 'Catanduva/SP',
  vehiclePlate: 'ABC1D23',
  status: 'IN_PROGRESS',
  plannedDeparture: null,
  plannedArrival: null,
  loadStatus: 'LOADED',
  initialOdometerKm: 100000,
  currentOdometerKm: 100850,
  defaultAxles: 9,
};

function renderScreen() {
  const navigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
  const route = { params: { tripId: 'trip-1' } };
  const utils = render(<FinishTripScreen route={route as never} navigation={navigation as never} />);
  return { ...utils, navigation };
}

// Fase 31, Parte 8 -- finalizacao da viagem.
describe('FinishTripScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getTrip.mockResolvedValue(TRIP);
    jest.spyOn(Location, 'getLastKnownPositionAsync').mockResolvedValue({
      coords: { latitude: -23.5, longitude: -46.6 },
    } as never);
  });

  it('exibe destino e KM atual quando a viagem carrega', async () => {
    renderScreen();

    expect(await screen.findByText('São Paulo/SP')).toBeTruthy();
    expect(screen.getByText('100850 km')).toBeTruthy();
  });

  it('nao permite finalizar sem informar o KM final', async () => {
    renderScreen();
    await screen.findByText('São Paulo/SP');

    fireEvent.press(screen.getByText('FINALIZAR VIAGEM'));
    expect(mockedSubmitOrQueue).not.toHaveBeenCalled();
  });

  it('finalizacao online: envia KM final e posicao, navega para Home', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    const { navigation } = renderScreen();
    await screen.findByText('São Paulo/SP');

    fireEvent.changeText(screen.getByLabelText('KM final'), '100850.5');
    fireEvent.press(screen.getByText('FINALIZAR VIAGEM'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith({
        kind: 'complete',
        tripId: 'trip-1',
        finalOdometerKm: 100850.5,
        latitude: -23.5,
        longitude: -46.6,
      }),
    );
    expect(navigation.replace).toHaveBeenCalledWith('Home');
  });

  it('finalizacao offline: enfileira via submitOrQueue e ainda assim navega para Home (sera sincronizada depois)', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: true });
    const { navigation } = renderScreen();
    await screen.findByText('São Paulo/SP');

    fireEvent.changeText(screen.getByLabelText('KM final'), '100900');
    fireEvent.press(screen.getByText('FINALIZAR VIAGEM'));

    await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
    expect(navigation.replace).toHaveBeenCalledWith('Home');
  });

  it('a tela NAO fica bloqueada esperando GET /driver/trips/:id -- sem conexao para carregar a viagem, o formulario de KM continua utilizavel', async () => {
    api.getTrip.mockRejectedValue(new Error('network down'));
    mockedSubmitOrQueue.mockResolvedValue({ queued: true });
    renderScreen();

    // Sem "trip" carregado, o card de destino/KM atual nao aparece, mas o
    // campo de KM final e o botao continuam disponiveis.
    await waitFor(() => expect(screen.getByLabelText('KM final')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('KM final'), '100900');
    fireEvent.press(screen.getByText('FINALIZAR VIAGEM'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'complete', tripId: 'trip-1', finalOdometerKm: 100900 }),
      ),
    );
  });

  it('reenvio da finalizacao (o motorista poderia tocar de novo): cada tentativa e enviada, idempotencia de estado fica no backend', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    renderScreen();
    await screen.findByText('São Paulo/SP');

    fireEvent.changeText(screen.getByLabelText('KM final'), '100850.5');
    fireEvent.press(screen.getByText('FINALIZAR VIAGEM'));
    await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
  });

  // Fase C -- motivo OPCIONAL da parada do veiculo apos esta viagem.
  it('sem selecionar motivo: o complete NAO carrega idleReason (motorista nao e obrigado)', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    renderScreen();
    await screen.findByText('São Paulo/SP');

    fireEvent.changeText(screen.getByLabelText('KM final'), '100850');
    fireEvent.press(screen.getByText('FINALIZAR VIAGEM'));

    await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
    const payload = mockedSubmitOrQueue.mock.calls[0]![0];
    expect(payload).toMatchObject({ kind: 'complete', tripId: 'trip-1', finalOdometerKm: 100850 });
    expect('idleReason' in payload).toBe(false);
  });

  it('selecionando um motivo: o complete carrega idleReason', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    renderScreen();
    await screen.findByText('São Paulo/SP');

    fireEvent.changeText(screen.getByLabelText('KM final'), '100850');
    fireEvent.press(screen.getByText('Descanso'));
    fireEvent.press(screen.getByText('FINALIZAR VIAGEM'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'complete', idleReason: 'DESCANSO' })),
    );
  });

  it('tocar o mesmo motivo de novo desmarca -- volta a nao enviar idleReason', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    renderScreen();
    await screen.findByText('São Paulo/SP');

    fireEvent.changeText(screen.getByLabelText('KM final'), '100850');
    fireEvent.press(screen.getByText('Pátio'));
    fireEvent.press(screen.getByText('Pátio'));
    fireEvent.press(screen.getByText('FINALIZAR VIAGEM'));

    await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
    expect('idleReason' in mockedSubmitOrQueue.mock.calls[0]![0]).toBe(false);
  });
});
