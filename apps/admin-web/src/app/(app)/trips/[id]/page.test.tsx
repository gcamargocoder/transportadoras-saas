import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../../components/ui/toast';
import type { TripEntity } from '../../../../types/entities';
import TripDetailPage from './page';

const getTripMock = vi.fn();
const cancelTripMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('../../../../lib/api/trips.api', () => ({
  getTrip: (...args: unknown[]) => getTripMock(...args),
  cancelTrip: (...args: unknown[]) => cancelTripMock(...args),
}));

vi.mock('../../../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'trip-1' }),
}));

// Fase 87 -- todas as abas sao stubs: cada uma faz suas proprias chamadas de
// API (financeiro, ocorrencias, timeline, etc.), irrelevantes para os testes
// de gating de "Editar planejamento"/"Cancelar viagem" desta pagina.
vi.mock('../../../../features/trips/tabs/advances-tab', () => ({ AdvancesTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/expenses-tab', () => ({ ExpensesTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/financial-tab', () => ({ FinancialTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/fiscal-tab', () => ({ FiscalTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/freight-tab', () => ({ FreightTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/occurrences-tab', () => ({ OccurrencesTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/operacao-tab', () => ({ OperacaoTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/overview-tab', () => ({ OverviewTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/reconciliation-tab', () => ({ ReconciliationTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/rota-tab', () => ({ RotaTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/revenues-tab', () => ({ RevenuesTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/shifts-tab', () => ({ ShiftsTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/timeline-tab', () => ({ TimelineTab: () => <div>stub</div> }));
vi.mock('../../../../features/trips/tabs/tolls-tab', () => ({ TollsTab: () => <div>stub</div> }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<TripDetailPage />, { wrapper: Wrapper });
}

function buildTrip(overrides: Partial<TripEntity> = {}): TripEntity {
  return {
    id: 'trip-1',
    tenantId: 't1',
    customerId: null,
    customerName: null,
    driverId: 'd1',
    driverName: 'José da Silva',
    originLocationId: 'o1',
    originName: 'São Paulo',
    destinationLocationId: 'd2',
    destinationName: 'Curitiba',
    compositionId: 'c1',
    vehiclePlate: 'ABC1D23',
    tollRouteId: null,
    tollRouteName: null,
    status: 'PLANNED',
    priority: 'NORMAL',
    notes: null,
    plannedDeparture: '2026-09-01T08:00:00.000Z',
    plannedArrival: '2026-09-02T18:00:00.000Z',
    actualDeparture: null,
    actualArrival: null,
    loadStatus: null,
    initialOdometerKm: null,
    currentOdometerKm: null,
    defaultAxles: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TripDetailPage (Fase 87)', () => {
  beforeEach(() => {
    getTripMock.mockReset();
    cancelTripMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
  });

  it('mostra "Editar planejamento" e "Cancelar viagem" quando PLANNED', async () => {
    getTripMock.mockResolvedValue(buildTrip({ status: 'PLANNED' }));
    renderPage();

    expect(await screen.findByText('Editar planejamento')).toBeInTheDocument();
    expect(screen.getByText('Cancelar viagem')).toBeInTheDocument();
  });

  it('esconde "Editar planejamento" quando a viagem ja esta em andamento (so cancelar continua disponivel)', async () => {
    getTripMock.mockResolvedValue(buildTrip({ status: 'IN_PROGRESS' }));
    renderPage();

    expect(await screen.findByText('Cancelar viagem')).toBeInTheDocument();
    expect(screen.queryByText('Editar planejamento')).not.toBeInTheDocument();
  });

  it('esconde "Editar planejamento" e "Cancelar viagem" quando a viagem ja foi concluida', async () => {
    getTripMock.mockResolvedValue(buildTrip({ status: 'COMPLETED' }));
    renderPage();

    expect((await screen.findAllByText(/São Paulo/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Editar planejamento')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancelar viagem')).not.toBeInTheDocument();
  });

  it('esconde as acoes de escrita para perfil somente leitura (AUDITOR)', async () => {
    useAuthMock.mockReturnValue({ user: { role: 'AUDITOR' } });
    getTripMock.mockResolvedValue(buildTrip({ status: 'PLANNED' }));
    renderPage();

    expect((await screen.findAllByText(/São Paulo/)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Editar planejamento')).not.toBeInTheDocument();
    expect(screen.queryByText('Cancelar viagem')).not.toBeInTheDocument();
  });

  it('cancela a viagem apos confirmar no dialogo', async () => {
    getTripMock.mockResolvedValue(buildTrip({ status: 'PLANNED' }));
    cancelTripMock.mockResolvedValue(buildTrip({ status: 'CANCELLED' }));
    renderPage();

    fireEvent.click(await screen.findByText('Cancelar viagem'));
    const confirmButtons = await screen.findAllByText('Cancelar viagem');
    const confirmButton = confirmButtons[confirmButtons.length - 1];
    if (!confirmButton) throw new Error('Botão de confirmação não encontrado.');
    fireEvent.click(confirmButton);

    await waitFor(() => expect(cancelTripMock).toHaveBeenCalledWith('trip-1'));
  });
});
