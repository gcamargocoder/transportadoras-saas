import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import React from 'react';
import { submitOrQueue } from '../storage/syncQueue';
import { FuelScreen } from './FuelScreen';

jest.mock('../storage/syncQueue');

const mockedSubmitOrQueue = submitOrQueue as jest.Mock;

function renderScreen() {
  const navigation = { goBack: jest.fn() };
  const route = { params: { tripId: 'trip-1' } };
  return render(<FuelScreen route={route as never} navigation={navigation as never} />);
}

// Auditoria "TMS + Driver App" -- gap real: abastecimento em transito nunca
// perguntava o tipo (diesel/ARLA/outro), todo registro do app caia em OUTRO
// no backend. Tela nunca tinha teste antes desta fase.
describe('FuelScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
  });

  it('por padrao envia fuelType DIESEL_S10 (nunca cai em OUTRO por omissao)', async () => {
    renderScreen();

    fireEvent.changeText(screen.getByLabelText('KM atual'), '150000');
    fireEvent.changeText(screen.getByLabelText('Litros'), '300');
    fireEvent.changeText(screen.getByLabelText('Valor pago'), '1950');
    fireEvent.press(screen.getByText('CONFIRMAR'));

    await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
    expect(mockedSubmitOrQueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'fuel-supply', tripId: 'trip-1', odometerKm: 150000, liters: 300, fuelType: 'DIESEL_S10' }),
    );
  });

  it('motorista consegue selecionar ARLA32 e o tipo escolhido e enviado no abastecimento em transito', async () => {
    renderScreen();

    fireEvent.changeText(screen.getByLabelText('KM atual'), '150000');
    fireEvent.press(screen.getByText('Arla 32'));
    fireEvent.changeText(screen.getByLabelText('Litros'), '40');
    fireEvent.changeText(screen.getByLabelText('Valor pago'), '200');
    fireEvent.press(screen.getByText('CONFIRMAR'));

    await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
    expect(mockedSubmitOrQueue).toHaveBeenCalledWith(expect.objectContaining({ fuelType: 'ARLA32' }));
  });

  it('local "Outro" tenta capturar GPS; falha de localizacao nunca bloqueia o envio (fallback silencioso)', async () => {
    jest.spyOn(Location, 'getLastKnownPositionAsync').mockRejectedValue(new Error('sem permissao'));
    renderScreen();

    fireEvent.changeText(screen.getByLabelText('KM atual'), '150000');
    fireEvent.press(screen.getByText('Outro local'));
    fireEvent.changeText(screen.getByLabelText('Litros'), '100');
    fireEvent.changeText(screen.getByLabelText('Valor pago'), '650');
    fireEvent.press(screen.getByText('CONFIRMAR'));

    await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
    const payload = mockedSubmitOrQueue.mock.calls[0]![0];
    expect(payload.latitude).toBeUndefined();
    expect(payload.longitude).toBeUndefined();
  });

  it('nao envia com KM/litros/valor invalidos', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('CONFIRMAR'));
    expect(mockedSubmitOrQueue).not.toHaveBeenCalled();
    expect(await screen.findByText('Informe KM, litros e valor pago validos.')).toBeTruthy();
  });
});
