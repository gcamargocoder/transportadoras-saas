import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TollReconciliationEntity } from '../../../types/entities';
import { ReconciliationTab } from './reconciliation-tab';

const getTripTollReconciliationMock = vi.fn();

vi.mock('../../../lib/api/trips.api', () => ({
  getTripTollReconciliation: (tripId: string) => getTripTollReconciliationMock(tripId),
}));

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<ReconciliationTab tripId="trip-1" />, { wrapper: Wrapper });
}

const NO_ROUTE_RESULT: TollReconciliationEntity = {
  tripId: 'trip-1',
  hasRoute: false,
  tollRouteId: null,
  tollRouteName: null,
  originLabel: null,
  destinationLabel: null,
  stops: [],
  unplannedTransactions: [],
  expectedStopsCount: 0,
  registeredStopsCount: 0,
  reconciledStopsCount: 0,
  expectedTotalAmount: 0,
  chargedTotalAmount: 0,
  divergenceAmount: 0,
  unplannedTotalAmount: 0,
  conformityPercentage: 0,
  isFullyReconciled: false,
};

const WITH_ROUTE_RESULT: TollReconciliationEntity = {
  tripId: 'trip-1',
  hasRoute: true,
  tollRouteId: 'route-1',
  tollRouteName: 'São José do Rio Preto → São Paulo',
  originLabel: 'São José do Rio Preto',
  destinationLabel: 'São Paulo',
  stops: [
    {
      sequence: 1,
      tollPlazaId: 'plaza-a',
      tollPlazaName: 'Praça A',
      highway: 'SP-310',
      transactionId: 'tx-a',
      axleCount: 4,
      expectedAmount: 60,
      chargedAmount: 60,
      discrepancyAmount: 0,
      verdict: 'CORRECT',
      message: null,
    },
    {
      sequence: 2,
      tollPlazaId: 'plaza-b',
      tollPlazaName: 'Praça B',
      highway: 'SP-310',
      transactionId: null,
      axleCount: 4,
      expectedAmount: 60,
      chargedAmount: null,
      discrepancyAmount: null,
      verdict: 'NOT_REGISTERED',
      message: 'Praça esperada nesta rota, mas nenhum pedágio foi registrado para esta viagem.',
    },
  ],
  unplannedTransactions: [
    {
      transactionId: 'tx-x',
      tollPlazaId: 'plaza-x',
      tollPlazaName: 'Praça X (fora da rota)',
      chargedAmount: 45,
      chargedAt: '2026-09-01T10:00:00.000Z',
    },
  ],
  expectedStopsCount: 2,
  registeredStopsCount: 1,
  reconciledStopsCount: 1,
  expectedTotalAmount: 120,
  chargedTotalAmount: 60,
  divergenceAmount: -60,
  unplannedTotalAmount: 45,
  conformityPercentage: 100,
  isFullyReconciled: false,
};

describe('ReconciliationTab', () => {
  it('mostra estado vazio quando a viagem não tem rota vinculada (hasRoute=false)', async () => {
    getTripTollReconciliationMock.mockResolvedValue(NO_ROUTE_RESULT);
    renderTab();

    expect(await screen.findByText(/não tem rota de pedágio vinculada/i)).toBeInTheDocument();
  });

  it('mostra o resumo e a tabela de paradas quando há rota vinculada', async () => {
    getTripTollReconciliationMock.mockResolvedValue(WITH_ROUTE_RESULT);
    renderTab();

    expect(await screen.findByText(/Rota: São José do Rio Preto → São Paulo/)).toBeInTheDocument();
    expect(screen.getAllByText('Praça A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Praça B').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cobrança correta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pedágio não registrado').length).toBeGreaterThan(0);
  });

  it('mostra a seção de pedágios não previstos separada das paradas esperadas', async () => {
    getTripTollReconciliationMock.mockResolvedValue(WITH_ROUTE_RESULT);
    renderTab();

    await waitFor(() =>
      expect(screen.getByText(/Pedágios não previstos pela rota/)).toBeInTheDocument(),
    );
    expect(screen.getAllByText('Praça X (fora da rota)').length).toBeGreaterThan(0);
  });

  it('mostra estado de erro com botão de tentar novamente', async () => {
    getTripTollReconciliationMock.mockRejectedValue(new Error('falhou'));
    renderTab();

    expect(await screen.findByText(/não foi possível carregar/i)).toBeInTheDocument();
  });
});
