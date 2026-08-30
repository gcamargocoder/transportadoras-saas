import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import React from 'react';
import * as driverTripsApi from '../api/driverTrips.api';
import { NearbyTollPlaza } from '../api/driverTrips.types';
import { submitOrQueue } from '../storage/syncQueue';
import { TollScreen } from './TollScreen';

jest.mock('../api/driverTrips.api');
jest.mock('../storage/syncQueue');

const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;
const mockedSubmitOrQueue = submitOrQueue as jest.Mock;

const PLAZA: NearbyTollPlaza = {
  tollPlazaId: 'plaza-1',
  name: 'Praca Demo',
  highway: 'SP-280',
  distanceMeters: 800,
  defaultAxles: 6,
};

function renderScreen() {
  const navigation = { goBack: jest.fn() };
  const route = { params: { tripId: 'trip-1' } };
  return render(<TollScreen route={route as never} navigation={navigation as never} />);
}

// Fase 25 (secoes 11-14) + melhoria de UX (stepper sem digitacao) -- passagem
// automatica por timeout, e alteracao de eixos por toques (+/-), nunca por
// teclado.
describe('TollScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    jest.spyOn(Location, 'getLastKnownPositionAsync').mockResolvedValue({
      coords: { latitude: -23.5, longitude: -46.6 },
    } as never);
  });

  it('sem praca proxima, exibe mensagem e nunca registra nada', async () => {
    api.getNearbyTollPlazas.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Nenhuma praca de pedagio proxima no momento.')).toBeTruthy();
    expect(mockedSubmitOrQueue).not.toHaveBeenCalled();
  });

  it('sem resposta ate o timeout, registra automaticamente com os eixos padrao (sem nenhum toque)', async () => {
    // Precisa fakear os timers ANTES de montar -- o primeiro setTimeout do
    // contador ja e agendado no efeito inicial; ativar fake timers depois
    // nunca alcanca um timer real ja agendado.
    jest.useFakeTimers();
    try {
      api.getNearbyTollPlazas.mockResolvedValue([PLAZA]);
      renderScreen();
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText('PEDAGIO PROXIMO')).toBeTruthy();

      // Um segundo por vez -- o proprio componente so agenda o PROXIMO
      // setTimeout depois que o efeito reage a mudanca de secondsLeft, entao
      // avancar tudo de uma vez nao encadeia os 20 timers corretamente.
      for (let i = 0; i < 20; i += 1) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
          await Promise.resolve();
        });
      }
    } finally {
      jest.useRealTimers();
    }

    expect(mockedSubmitOrQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'axle-event-open',
        tripId: 'trip-1',
        tollPlazaId: 'plaza-1',
        source: 'TIMEOUT_DEFAULT',
      }),
    );
    const call = mockedSubmitOrQueue.mock.calls[0]?.[0];
    expect(call.declaredAxles).toBeUndefined();
    expect(screen.getByText('Registrado.')).toBeTruthy();
  });

  it('ALTERAR EIXOS abre um stepper (+/-) iniciado no padrao da composicao', async () => {
    api.getNearbyTollPlazas.mockResolvedValue([PLAZA]);
    renderScreen();
    await screen.findByText('PEDAGIO PROXIMO');

    fireEvent.press(screen.getByText('ALTERAR EIXOS'));

    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('−')).toBeTruthy();
    expect(screen.getByText('+')).toBeTruthy();
  });

  it('toques em "-" reduzem os eixos (nunca abaixo de 1) e CONFIRMAR envia o valor declarado', async () => {
    api.getNearbyTollPlazas.mockResolvedValue([PLAZA]);
    renderScreen();
    await screen.findByText('PEDAGIO PROXIMO');

    fireEvent.press(screen.getByText('ALTERAR EIXOS'));
    fireEvent.press(screen.getByText('−'));
    fireEvent.press(screen.getByText('−'));
    expect(screen.getByText('4')).toBeTruthy();

    fireEvent.press(screen.getByText('CONFIRMAR'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'axle-event-open',
          tollPlazaId: 'plaza-1',
          source: 'DRIVER_INPUT',
          declaredAxles: 4,
        }),
      ),
    );
  });

  it('toques em "+" nunca ultrapassam o padrao da composicao (6)', async () => {
    api.getNearbyTollPlazas.mockResolvedValue([PLAZA]);
    renderScreen();
    await screen.findByText('PEDAGIO PROXIMO');

    fireEvent.press(screen.getByText('ALTERAR EIXOS'));
    fireEvent.press(screen.getByText('+'));
    fireEvent.press(screen.getByText('+'));
    expect(screen.getByText('6')).toBeTruthy();
  });
});
