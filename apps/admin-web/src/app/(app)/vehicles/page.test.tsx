import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/toast';
import type { VehicleEntity, VehicleSummaryEntity } from '../../../types/entities';
import VehiclesPage from './page';

const listVehiclesMock = vi.fn();
const getVehicleSummaryMock = vi.fn();
const useAuthMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../lib/api/fleet.api', () => ({
  listVehicles: (...args: unknown[]) => listVehiclesMock(...args),
  getVehicleSummary: (...args: unknown[]) => getVehicleSummaryMock(...args),
}));

vi.mock('../../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
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
  return render(<VehiclesPage />, { wrapper: Wrapper });
}

function buildVehicle(overrides: Partial<VehicleEntity> = {}): VehicleEntity {
  return {
    id: 'v1',
    tenantId: 't1',
    fleetId: null,
    plate: 'ABC1D23',
    renavam: null,
    chassisNumber: null,
    brand: 'Volvo',
    model: 'FH 540',
    manufactureYear: 2020,
    modelYear: 2020,
    color: null,
    type: 'TRACTOR_UNIT',
    category: null,
    fuelType: null,
    tankCapacityLiters: null,
    averageConsumptionKmL: null,
    odometerKm: 100000,
    grossWeightKg: null,
    netWeightKg: null,
    cargoCapacityKg: null,
    axleCount: null,
    notes: null,
    status: 'ACTIVE',
    ownershipType: 'OWN',
    currentDriverId: null,
    currentDriverName: null,
    availability: 'AVAILABLE',
    fleetAvailabilityStatus: 'AVAILABLE',
    unavailabilityReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildSummary(overrides: Partial<VehicleSummaryEntity> = {}): VehicleSummaryEntity {
  return {
    total: 5,
    totalActive: 4,
    totalInactive: 1,
    totalSuspended: 0,
    totalMaintenance: 1,
    totalAvailable: 3,
    totalUnavailable: 1,
    totalOnTrip: 1,
    totalOwn: 5,
    totalAggregated: 0,
    totalThirdParty: 0,
    availabilityBreakdown: [
      { status: 'AVAILABLE', count: 3, percent: 60 },
      { status: 'ON_TRIP', count: 1, percent: 20 },
      { status: 'MAINTENANCE', count: 1, percent: 20 },
      { status: 'INACTIVE', count: 0, percent: 0 },
      { status: 'UNAVAILABLE', count: 0, percent: 0 },
    ],
    ...overrides,
  };
}

describe('VehiclesPage (Fase 86)', () => {
  beforeEach(() => {
    listVehiclesMock.mockReset();
    getVehicleSummaryMock.mockReset();
    useAuthMock.mockReset();
    pushMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
  });

  it('mostra os KPIs de disponibilidade com quantidade e percentual', async () => {
    getVehicleSummaryMock.mockResolvedValue(buildSummary());
    listVehiclesMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } });
    renderPage();

    expect(await screen.findByText('Disponíveis')).toBeInTheDocument();
    expect(screen.getByText('3 (60.0%)')).toBeInTheDocument();
    expect(screen.getByText('Indisponíveis')).toBeInTheDocument();
  });

  it('exibe o status operacional (Fase 86) e o motivo quando o veiculo esta em manutencao', async () => {
    getVehicleSummaryMock.mockResolvedValue(buildSummary());
    const reason = 'Veiculo em manutencao (ordem de servico em andamento).';
    listVehiclesMock.mockResolvedValue({
      items: [
        buildVehicle({
          id: 'v-maint',
          status: 'MAINTENANCE',
          availability: 'UNAVAILABLE',
          fleetAvailabilityStatus: 'MAINTENANCE',
          unavailabilityReason: reason,
        }),
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    renderPage();

    // Aguarda a linha real da tabela (nao o <select> de filtro, que ja tem
    // "Em manutenção" como opcao estatica desde o primeiro render) usando o
    // motivo como ancora -- texto exclusivo da celula de disponibilidade.
    const reasonMatches = await screen.findAllByText(reason);
    expect(reasonMatches.length).toBeGreaterThan(0);
  });

  it('nao mostra motivo quando o veiculo esta disponivel', async () => {
    getVehicleSummaryMock.mockResolvedValue(buildSummary());
    listVehiclesMock.mockResolvedValue({
      items: [buildVehicle()],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    renderPage();

    const plateMatches = await screen.findAllByText('ABC1D23');
    expect(plateMatches.length).toBeGreaterThan(0);
    expect(
      screen.queryByText('Veiculo em manutencao (ordem de servico em andamento).'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Veiculo inativo.')).not.toBeInTheDocument();
  });

  it('exibe o status Inativo com motivo quando o veiculo esta inativo', async () => {
    getVehicleSummaryMock.mockResolvedValue(buildSummary());
    const reason = 'Veiculo inativo.';
    listVehiclesMock.mockResolvedValue({
      items: [
        buildVehicle({
          id: 'v-inactive',
          status: 'INACTIVE',
          availability: 'UNAVAILABLE',
          fleetAvailabilityStatus: 'INACTIVE',
          unavailabilityReason: reason,
        }),
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    renderPage();

    const reasonMatches = await screen.findAllByText(reason);
    expect(reasonMatches.length).toBeGreaterThan(0);
  });
});
