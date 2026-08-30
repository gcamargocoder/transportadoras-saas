import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/toast';
import type { FuelDashboardEntity, FuelSupplyEntity } from '../../../types/entities';
import FuelSuppliesPage from './page';

const listFuelSuppliesMock = vi.fn();
const getFuelDashboardMock = vi.fn();
const listTripsMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('../../../lib/api/fuel.api', () => ({
  listFuelSupplies: (...args: unknown[]) => listFuelSuppliesMock(...args),
  getFuelDashboard: (...args: unknown[]) => getFuelDashboardMock(...args),
  deleteFuelSupply: vi.fn(),
  listFuelStations: () => Promise.resolve({ items: [] }),
}));

vi.mock('../../../lib/api/trips.api', () => ({
  listTrips: (...args: unknown[]) => listTripsMock(...args),
}));

vi.mock('../../../lib/api/drivers.api', () => ({
  listDrivers: () => Promise.resolve({ items: [] }),
}));

vi.mock('../../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [] }),
}));

vi.mock('../../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<FuelSuppliesPage />, { wrapper: Wrapper });
}

function buildDashboard(overrides: Partial<FuelDashboardEntity> = {}): FuelDashboardEntity {
  return {
    suppliesCount: 3,
    totalLiters: 600,
    totalAmount: 3600,
    averageConsumptionKmL: 2.5,
    costPerKm: 1.2,
    mostUsedStation: null,
    topVehicle: null,
    topDriver: null,
    ...overrides,
  };
}

function buildSupply(overrides: Partial<FuelSupplyEntity> = {}): FuelSupplyEntity {
  return {
    id: 'supply-1',
    tenantId: 't1',
    vehicleId: 'v1',
    vehiclePlate: 'ABC1D23',
    driverId: 'd1',
    driverName: 'José da Silva',
    tripId: null,
    tripLabel: null,
    fuelStationId: 'fs1',
    fuelStationName: 'Posto Central',
    attachmentId: null,
    fuelType: 'DIESEL_S10',
    liters: 200,
    pricePerLiter: 6,
    totalAmount: 1200,
    odometerKm: 100000,
    supplyDate: '2026-09-01T10:00:00.000Z',
    paymentType: null,
    invoiceNumber: null,
    notes: null,
    createdBy: 'u1',
    creatorName: 'Admin',
    updatedBy: null,
    updaterName: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('FuelSuppliesPage (Fase 107)', () => {
  beforeEach(() => {
    listFuelSuppliesMock.mockReset();
    getFuelDashboardMock.mockReset();
    listTripsMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    listTripsMock.mockResolvedValue({ items: [] });
    getFuelDashboardMock.mockResolvedValue(buildDashboard());
    listFuelSuppliesMock.mockResolvedValue({
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    });
  });

  it('mostra o StatCard de custo por km vindo do dashboard', async () => {
    renderPage();

    expect(await screen.findByText('Custo por km')).toBeInTheDocument();
    expect(screen.getByText('R$ 1,20')).toBeInTheDocument();
  });

  it('mostra "-" no custo por km quando indisponível (nunca inventa valor)', async () => {
    getFuelDashboardMock.mockResolvedValue(buildDashboard({ costPerKm: null }));
    renderPage();

    await screen.findByText('Custo por km');
    const cards = screen.getAllByText('-');
    expect(cards.length).toBeGreaterThan(0);
  });

  // DataTable renderiza tabela (desktop) + cartões (mobile) simultaneamente
  // no DOM (visibilidade só por CSS) -- por isso findAllByText/getAllByText,
  // nunca findByText/getByText (mesmo padrão já usado em outras páginas com
  // DataTable, ex.: reconciliation-tab.test.tsx). FilterBar tem a mesma
  // duplicação (desktop + drawer), daí findAllByLabelText no teste de filtro.
  it('mostra a coluna "Viagem" com o tripLabel quando o abastecimento está vinculado a uma viagem', async () => {
    listFuelSuppliesMock.mockResolvedValue({
      items: [buildSupply({ tripId: 'trip-1', tripLabel: 'Catanduva/SP → São Paulo/SP' })],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    renderPage();

    expect((await screen.findAllByText('Catanduva/SP → São Paulo/SP')).length).toBeGreaterThan(0);
  });

  it('mostra "—" na coluna "Viagem" quando o abastecimento não está vinculado a nenhuma viagem', async () => {
    listFuelSuppliesMock.mockResolvedValue({
      items: [buildSupply()],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    renderPage();

    await screen.findAllByText('José da Silva');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('filtra por viagem ao selecionar no filtro (reenvia listFuelSupplies com tripId)', async () => {
    listTripsMock.mockResolvedValue({
      items: [
        {
          id: 'trip-1',
          originName: 'Catanduva/SP',
          destinationName: 'São Paulo/SP',
          vehiclePlate: 'ABC1D23',
          plannedDeparture: '2026-09-01T08:00:00.000Z',
        },
      ],
    });
    renderPage();

    const tripSelects = await screen.findAllByLabelText('Viagem');
    const { fireEvent } = await import('@testing-library/react');
    // Aguarda a opcao real carregar (listTrips e assincrono) -- setar .value
    // para um valor sem <option> correspondente e um no-op silencioso do
    // <select> nativo, entao o onChange nunca dispararia com 'trip-1'.
    await waitFor(() => {
      expect(tripSelects[0]!.querySelector('option[value="trip-1"]')).not.toBeNull();
    });
    fireEvent.change(tripSelects[0]!, { target: { value: 'trip-1' } });

    await waitFor(() =>
      expect(listFuelSuppliesMock).toHaveBeenCalledWith(
        expect.objectContaining({ tripId: 'trip-1' }),
        expect.anything(),
      ),
    );
  });
});
