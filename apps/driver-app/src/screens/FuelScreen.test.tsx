import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import React from 'react';
import * as driverTripsApi from '../api/driverTrips.api';
import { submitOrQueue } from '../storage/syncQueue';
import { FuelScreen } from './FuelScreen';

jest.mock('../storage/syncQueue');
jest.mock('../api/driverTrips.api');

const mockedSubmitOrQueue = submitOrQueue as jest.Mock;
const mockedGetActiveFuelTanks = driverTripsApi.getActiveFuelTanks as jest.Mock;

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
    // Padrao: tenant sem nenhum tanque cadastrado -- "Transportadora"
    // continua funcionando como abastecimento externo (Fase 3, secao 10:
    // sem tanque algum, nunca bloqueia o motorista nem exige escolha).
    mockedGetActiveFuelTanks.mockResolvedValue([]);
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

  // Gestao de Combustivel, Fase 3 -- abastecimento interno.
  describe('abastecimento interno (Fase 3)', () => {
    it('um unico tanque ativo: auto-seleciona e envia fuelTankId sem exigir escolha do motorista', async () => {
      mockedGetActiveFuelTanks.mockResolvedValue([{ id: 'tank-1', name: 'Tanque matriz', currentStockLiters: 5000 }]);
      renderScreen();
      await waitFor(() => expect(mockedGetActiveFuelTanks).toHaveBeenCalledTimes(1));

      expect(screen.queryByText('Tanque')).toBeNull(); // nenhum seletor mostrado

      fireEvent.changeText(screen.getByLabelText('KM atual'), '150000');
      fireEvent.changeText(screen.getByLabelText('Litros'), '300');
      fireEvent.changeText(screen.getByLabelText('Valor pago'), '1650');
      fireEvent.press(screen.getByText('CONFIRMAR'));

      await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(expect.objectContaining({ fuelTankId: 'tank-1' }));
    });

    it('multiplos tanques ativos: exige escolha antes de enviar', async () => {
      mockedGetActiveFuelTanks.mockResolvedValue([
        { id: 'tank-1', name: 'Tanque matriz', currentStockLiters: 5000 },
        { id: 'tank-2', name: 'Tanque filial', currentStockLiters: 3000 },
      ]);
      renderScreen();
      await waitFor(() => expect(screen.getByText('Tanque filial')).toBeTruthy());

      fireEvent.changeText(screen.getByLabelText('KM atual'), '150000');
      fireEvent.changeText(screen.getByLabelText('Litros'), '300');
      fireEvent.changeText(screen.getByLabelText('Valor pago'), '1650');
      fireEvent.press(screen.getByText('CONFIRMAR'));

      expect(mockedSubmitOrQueue).not.toHaveBeenCalled();
      expect(await screen.findByText('Selecione o tanque de onde saiu o diesel.')).toBeTruthy();

      fireEvent.press(screen.getByText('Tanque filial'));
      fireEvent.press(screen.getByText('CONFIRMAR'));

      await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(expect.objectContaining({ fuelTankId: 'tank-2' }));
    });

    it('sem nenhum tanque cadastrado, "Transportadora" continua enviando como externo (sem fuelTankId)', async () => {
      renderScreen(); // mock padrao do beforeEach: getActiveFuelTanks -> []

      fireEvent.changeText(screen.getByLabelText('KM atual'), '150000');
      fireEvent.changeText(screen.getByLabelText('Litros'), '300');
      fireEvent.changeText(screen.getByLabelText('Valor pago'), '1650');
      fireEvent.press(screen.getByText('CONFIRMAR'));

      await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
      const payload = mockedSubmitOrQueue.mock.calls[0]![0];
      expect(payload.fuelTankId).toBeUndefined();
    });

    it('local "Outro" nunca envia fuelTankId mesmo com tanques ativos disponiveis', async () => {
      mockedGetActiveFuelTanks.mockResolvedValue([{ id: 'tank-1', name: 'Tanque matriz', currentStockLiters: 5000 }]);
      renderScreen();
      await waitFor(() => expect(mockedGetActiveFuelTanks).toHaveBeenCalledTimes(1));

      fireEvent.changeText(screen.getByLabelText('KM atual'), '150000');
      fireEvent.press(screen.getByText('Outro local'));
      fireEvent.changeText(screen.getByLabelText('Litros'), '100');
      fireEvent.changeText(screen.getByLabelText('Valor pago'), '650');
      fireEvent.press(screen.getByText('CONFIRMAR'));

      await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalledTimes(1));
      const payload = mockedSubmitOrQueue.mock.calls[0]![0];
      expect(payload.fuelTankId).toBeUndefined();
    });
  });
});
