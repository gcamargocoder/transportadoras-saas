import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import * as driverTripsApi from '../api/driverTrips.api';
import { flushQueue } from '../storage/syncQueue';
import { DriverActiveTrip } from '../api/driverTrips.types';
import { TripProvider, useTrip } from './TripContext';

jest.mock('../api/driverTrips.api');
jest.mock('../storage/syncQueue', () => ({
  flushQueue: jest.fn().mockResolvedValue({ sent: 0, remaining: 0 }),
}));

const api = driverTripsApi as jest.Mocked<typeof driverTripsApi>;
const mockedFlushQueue = flushQueue as jest.Mock;

function Consumer(): React.JSX.Element {
  const { isLoading, activeTrip } = useTrip();
  if (isLoading) return <Text>carregando</Text>;
  return <Text>{activeTrip ? `ativa:${activeTrip.status}:${activeTrip.id}` : 'sem-viagem-ativa'}</Text>;
}

const ACTIVE_TRIP: DriverActiveTrip = {
  id: 'trip-1',
  status: 'IN_PROGRESS',
  destinationName: 'São Paulo/SP',
  vehiclePlate: 'ABC1D23',
  lastLocation: null,
  updatedAt: '2026-09-01T12:00:00.000Z',
};

// Fase 31, Parte 6 -- "fechar e reabrir o app": TripProvider e a UNICA fonte
// de verdade (Fase 25), reaproveitada aqui sem alteracao. Nunca cria viagem
// nova -- so LE GET /driver/trips/active a cada montagem/refresh.
describe('TripContext -- recuperacao de viagem ativa ao (re)abrir o app', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFlushQueue.mockResolvedValue({ sent: 0, remaining: 0 });
    api.getConfig.mockResolvedValue({
      gpsPingIntervalSeconds: 30,
      stopDetectionMinutes: 10,
      stopRadiusMeters: 150,
      tollProximityRadiusMeters: 3000,
    });
  });

  it('ao montar, tenta sincronizar a fila offline antes de buscar a viagem ativa', async () => {
    api.getActiveTrip.mockResolvedValue(null);
    render(
      <TripProvider>
        <Consumer />
      </TripProvider>,
    );

    await screen.findByText('sem-viagem-ativa');
    expect(mockedFlushQueue).toHaveBeenCalledTimes(1);
    expect(api.getActiveTrip).toHaveBeenCalledTimes(1);
  });

  it('viagem ACTIVE (IN_PROGRESS) e recuperada automaticamente, sem criar viagem nova', async () => {
    api.getActiveTrip.mockResolvedValue(ACTIVE_TRIP);
    render(
      <TripProvider>
        <Consumer />
      </TripProvider>,
    );

    await screen.findByText('ativa:IN_PROGRESS:trip-1');
    // Nenhum metodo de criacao foi chamado -- a unica chamada de viagem e a
    // leitura de GET /driver/trips/active.
    expect(api.getActiveTrip).toHaveBeenCalledTimes(1);
  });

  it('viagem PAUSED e recuperada automaticamente', async () => {
    api.getActiveTrip.mockResolvedValue({ ...ACTIVE_TRIP, status: 'PAUSED' });
    render(
      <TripProvider>
        <Consumer />
      </TripProvider>,
    );

    await screen.findByText('ativa:PAUSED:trip-1');
  });

  it('viagem COMPLETED nao reaparece como ativa (backend ja exclui; contexto so reflete null)', async () => {
    api.getActiveTrip.mockResolvedValue(null);
    render(
      <TripProvider>
        <Consumer />
      </TripProvider>,
    );

    await screen.findByText('sem-viagem-ativa');
  });

  it('falha ao buscar a viagem ativa nao quebra o app -- vira "sem viagem ativa" (nunca lanca)', async () => {
    api.getActiveTrip.mockRejectedValue(new Error('network down'));
    render(
      <TripProvider>
        <Consumer />
      </TripProvider>,
    );

    await waitFor(() => expect(screen.getByText('sem-viagem-ativa')).toBeTruthy());
  });
});
