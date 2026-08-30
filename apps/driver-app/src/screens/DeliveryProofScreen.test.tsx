import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import * as deliveryProofFiles from '../storage/deliveryProofFiles';
import * as deviceEventIdModule from '../storage/deviceEventId';
import { submitOrQueue } from '../storage/syncQueue';
import { DeliveryProofScreen } from './DeliveryProofScreen';

jest.mock('../storage/syncQueue');
jest.mock('../storage/deliveryProofFiles');
jest.mock('../storage/deviceEventId');

// Mocka expo-image-picker no LIMITE (mesmo principio ja usado para
// expo-location em jest.setup.js) -- nunca abre camera/galeria real no
// ambiente de teste.
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const files = deliveryProofFiles as jest.Mocked<typeof deliveryProofFiles>;
const mockedSubmitOrQueue = submitOrQueue as jest.Mock;
const mockedGenerateDeviceEventId = deviceEventIdModule.generateDeviceEventId as jest.Mock;

function renderScreen(params: Record<string, unknown> = { tripId: 'trip-1' }) {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const route = { params };
  return render(<DeliveryProofScreen route={route as never} navigation={navigation as never} />);
}

async function capturePhoto(): Promise<void> {
  picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as never);
  picker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/photo.jpg' }] } as never);
  files.persistDeliveryProofFile.mockResolvedValue('file:///docs/delivery-proof/photo.jpg');

  fireEvent.press(screen.getByText('Tirar foto'));
  await waitFor(() => expect(files.persistDeliveryProofFile).toHaveBeenCalled());
}

// Fase 56 -- comprovante de entrega (Viagem -> Entrega -> Registrar
// comprovante). Cobre captura, confirmacao (online/offline via
// submitOrQueue -- mesma fila/idempotencia de todo o app) e o bloqueio de
// confirmar sem foto.
describe('DeliveryProofScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGenerateDeviceEventId.mockReturnValue('dev-fixed-1');
  });

  it('nao permite confirmar sem tirar foto antes', () => {
    renderScreen();

    fireEvent.press(screen.getByText('CONFIRMAR ENTREGA'));
    expect(mockedSubmitOrQueue).not.toHaveBeenCalled();
  });

  it('captura a foto (persistida localmente) e confirma online: envia via submitOrQueue com kind delivery-proof', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    renderScreen();

    await capturePhoto();
    fireEvent.press(screen.getByText('CONFIRMAR ENTREGA'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'delivery-proof',
          tripId: 'trip-1',
          deviceEventId: 'dev-fixed-1',
          localFileUri: 'file:///docs/delivery-proof/photo.jpg',
        }),
      ),
    );
    expect(await screen.findByText('Comprovante de entrega registrado.')).toBeTruthy();
  });

  it('inclui a observacao quando preenchida', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    renderScreen();

    await capturePhoto();
    fireEvent.changeText(screen.getByLabelText('Observacao (opcional)'), 'Entregue ao porteiro');
    fireEvent.press(screen.getByText('CONFIRMAR ENTREGA'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(expect.objectContaining({ observation: 'Entregue ao porteiro' })),
    );
  });

  it('offline: submitOrQueue enfileira e a tela mostra o aviso, sem travar', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: true });
    renderScreen();

    await capturePhoto();
    fireEvent.press(screen.getByText('CONFIRMAR ENTREGA'));

    expect(
      await screen.findByText('Sem conexao agora -- o comprovante sera enviado automaticamente assim que possivel.'),
    ).toBeTruthy();
  });

  // Fase 106 -- vinda da tela "Entregas" (DeliveryStopsScreen), o comprovante
  // ja chega vinculado a UMA parada especifica (tripDeliveryStopId), que
  // precisa seguir ate submitOrQueue -- sem isso o modal "Comprovantes" do
  // admin-web (Fase 100) nunca encontraria o documento vinculado aquela
  // parada.
  it('vindo da tela Entregas (tripDeliveryStopId presente): mostra a parada e repassa o vinculo ao enfileirar', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    renderScreen({ tripId: 'trip-1', tripDeliveryStopId: 'stop-1', stopLabel: '2. Cliente ABC' });

    expect(screen.getByText('Parada: 2. Cliente ABC')).toBeTruthy();

    await capturePhoto();
    fireEvent.press(screen.getByText('CONFIRMAR ENTREGA'));

    await waitFor(() =>
      expect(mockedSubmitOrQueue).toHaveBeenCalledWith(
        expect.objectContaining({ tripId: 'trip-1', tripDeliveryStopId: 'stop-1' }),
      ),
    );
  });

  it('sem vinda da tela Entregas: nao mostra rotulo de parada e nao envia tripDeliveryStopId', async () => {
    mockedSubmitOrQueue.mockResolvedValue({ queued: false });
    renderScreen();

    expect(screen.queryByText(/^Parada:/)).toBeNull();

    await capturePhoto();
    fireEvent.press(screen.getByText('CONFIRMAR ENTREGA'));

    await waitFor(() => expect(mockedSubmitOrQueue).toHaveBeenCalled());
    const call = mockedSubmitOrQueue.mock.calls[0]![0];
    expect(call.tripDeliveryStopId).toBeUndefined();
  });
});
