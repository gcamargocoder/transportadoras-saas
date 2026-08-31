import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import React from 'react';
import * as driverTripsApi from '../api/driverTrips.api';
import { DriverTrip } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { StartTripScreen } from './StartTripScreen';

jest.mock('../api/driverTrips.api');
jest.mock('../storage/syncQueue');

const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;
const mockedSubmitOrQueue = submitOrQueue as jest.Mock;

const TRIP: DriverTrip = {
  id: 'trip-1',
  destinationName: 'São Paulo/SP',
  originName: 'Catanduva/SP',
  vehiclePlate: 'ABC1D23',
  status: 'PLANNED',
  plannedDeparture: null,
  plannedArrival: null,
  loadStatus: null,
  initialOdometerKm: null,
  currentOdometerKm: null,
  defaultAxles: 9,
};

function renderScreen() {
  const navigation = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
  const route = { params: { tripId: 'trip-1' } };
  const utils = render(
    <StartTripScreen route={route as never} navigation={navigation as never} />,
  );
  return { ...utils, navigation };
}

// Fase 31, Parte 4 -- tela "INICIAR VIAGEM" (StartTripScreen).
describe('StartTripScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getTrip.mockResolvedValue(TRIP);
    api.startTrip.mockResolvedValue({ ...TRIP, status: 'IN_PROGRESS' });
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
  });

  it('carrega e exibe caminhao, origem e destino ja definidos pelo escritorio', async () => {
    renderScreen();

    expect(await screen.findByText('ABC1D23')).toBeTruthy();
    expect(screen.getByText('Catanduva/SP')).toBeTruthy();
    expect(screen.getByText('São Paulo/SP')).toBeTruthy();
    expect(screen.getByText('9 eixos')).toBeTruthy();
  });

  it('nao permite iniciar sem KM e sem status de carga (botao fica desabilitado, dados obrigatorios)', async () => {
    renderScreen();
    await screen.findByText('ABC1D23');

    // Pressable com disabled=true (canSubmit=false) nao dispara onPress --
    // RNTL respeita accessibilityState.disabled, entao startTrip nunca roda.
    fireEvent.press(screen.getByText('INICIAR VIAGEM'));
    expect(api.startTrip).not.toHaveBeenCalled();

    // So preencher KM (sem status de carga) ainda mantem desabilitado.
    fireEvent.changeText(screen.getByLabelText('KM atual'), '100000');
    fireEvent.press(screen.getByText('INICIAR VIAGEM'));
    expect(api.startTrip).not.toHaveBeenCalled();
  });

  it('KM inicial e status de carga (LOADED/EMPTY) podem ser informados e habilitam o envio', async () => {
    renderScreen();
    await screen.findByText('ABC1D23');

    fireEvent.changeText(screen.getByLabelText('KM atual'), '152340');
    fireEvent.press(screen.getByText('Vazio'));
    fireEvent.press(screen.getByText('INICIAR VIAGEM'));

    await waitFor(() => expect(api.startTrip).toHaveBeenCalledTimes(1));
    expect(api.startTrip).toHaveBeenCalledWith('trip-1', { odometerKm: 152340, loadStatus: 'EMPTY' });
  });

  it('abastecimento na largada (litros + valor pago) e enviado via syncQueue antes do start', async () => {
    jest.spyOn(Location, 'getLastKnownPositionAsync').mockResolvedValue({
      coords: { latitude: -23.5, longitude: -46.6 },
    } as never);
    renderScreen();
    await screen.findByText('ABC1D23');

    fireEvent.changeText(screen.getByLabelText('KM atual'), '100000');
    fireEvent.press(screen.getByText('Carregado'));
    fireEvent.press(screen.getByText('Abasteci'));
    fireEvent.press(screen.getByText('Outro local'));
    fireEvent.changeText(screen.getByLabelText('Litros'), '200');
    fireEvent.changeText(screen.getByLabelText('Valor pago'), '1300');
    fireEvent.press(screen.getByText('INICIAR VIAGEM'));

    await waitFor(() => expect(api.startTrip).toHaveBeenCalledTimes(1));
    expect(mockedSubmitOrQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'fuel-supply',
        tripId: 'trip-1',
        odometerKm: 100000,
        liters: 200,
        fuelType: 'DIESEL_S10', // gap real da auditoria "TMS + Driver App": default sensato, nunca mais OUTRO por omissao.
        pricePerLiter: 6.5,
        latitude: -23.5,
        longitude: -46.6,
      }),
    );
  });

  it('motorista pode trocar o tipo de combustivel (ex: Arla 32) e o valor selecionado e enviado no abastecimento da largada', async () => {
    renderScreen();
    await screen.findByText('ABC1D23');

    fireEvent.changeText(screen.getByLabelText('KM atual'), '100000');
    fireEvent.press(screen.getByText('Carregado'));
    fireEvent.press(screen.getByText('Abasteci'));
    fireEvent.press(screen.getByText('Arla 32'));
    fireEvent.changeText(screen.getByLabelText('Litros'), '40');
    fireEvent.changeText(screen.getByLabelText('Valor pago'), '200');
    fireEvent.press(screen.getByText('INICIAR VIAGEM'));

    await waitFor(() => expect(api.startTrip).toHaveBeenCalledTimes(1));
    expect(mockedSubmitOrQueue).toHaveBeenCalledWith(expect.objectContaining({ fuelType: 'ARLA32' }));
  });

  it('a acao de iniciar chama POST /driver/trips/:id/start com o payload correto e navega para Home (viagem fica ACTIVE)', async () => {
    const { navigation } = renderScreen();
    await screen.findByText('ABC1D23');

    fireEvent.changeText(screen.getByLabelText('KM atual'), '152340.5');
    fireEvent.press(screen.getByText('Carregado'));
    fireEvent.press(screen.getByText('INICIAR VIAGEM'));

    await waitFor(() => expect(api.startTrip).toHaveBeenCalledWith('trip-1', { odometerKm: 152340.5, loadStatus: 'LOADED' }));
    expect(navigation.replace).toHaveBeenCalledWith('Home');
  });
});
