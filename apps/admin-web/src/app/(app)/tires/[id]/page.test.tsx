import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../../components/ui/toast';
import type { TireEntity } from '../../../../types/entities';
import TireDetailPage from './page';

const getTireMock = vi.fn();
const getTireHistoryMock = vi.fn();
const getTireMovementsMock = vi.fn();
const getTireRetreadsMock = vi.fn();
const getTireInspectionsMock = vi.fn();
const useAuthMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../../lib/api/tires.api', () => ({
  getTire: (...args: unknown[]) => getTireMock(...args),
  getTireHistory: (...args: unknown[]) => getTireHistoryMock(...args),
  getTireMovements: (...args: unknown[]) => getTireMovementsMock(...args),
  getTireRetreads: (...args: unknown[]) => getTireRetreadsMock(...args),
  getTireInspections: (...args: unknown[]) => getTireInspectionsMock(...args),
}));

vi.mock('../../../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'tire-1' }),
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
  return render(<TireDetailPage />, { wrapper: Wrapper });
}

function buildTire(overrides: Partial<TireEntity> = {}): TireEntity {
  return {
    id: 'tire-1',
    tenantId: 't1',
    fireNumber: 'FG-001',
    manufacturer: 'Michelin',
    model: 'X Multi',
    size: '295/80R22.5',
    dot: null,
    serialNumber: null,
    purchaseDate: '2026-01-01',
    purchasePrice: 1500,
    expectedLifespanKm: 80000,
    initialTreadDepthMm: 20,
    currentTreadDepthMm: 15,
    status: 'IN_USE',
    locationType: 'VEHICLE',
    vehicleId: 'v1',
    vehiclePlate: 'ABC1D23',
    trailerId: null,
    trailerPlate: null,
    position: 'Dianteiro Esquerdo',
    createdBy: 'u1',
    creatorName: 'Admin',
    updatedBy: null,
    updaterName: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lifecycle: {
      totalCost: 1500,
      interventionsCount: 0,
      daysInstalled: 10,
      costPerKm: { value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' },
      distanceTraveledSinceInstallKm: null,
      remainingLifespanKm: null,
      lifespanUsedPercent: null,
    },
    ...overrides,
  };
}

// Fase 110 -- fecha a lacuna real de UI: GET /tires/:id ja retornava
// distanceTraveledSinceInstallKm/remainingLifespanKm/lifespanUsedPercent,
// mas a pagina nunca exibia esses indicadores.
describe('TireDetailPage (Fase 110 -- indicadores de vida util por distancia)', () => {
  beforeEach(() => {
    getTireMock.mockReset();
    getTireHistoryMock.mockReset();
    getTireMovementsMock.mockReset();
    getTireRetreadsMock.mockReset();
    getTireInspectionsMock.mockReset();
    pushMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
  });

  it('mostra "Indisponível" para os 3 indicadores quando ainda nao ha dados suficientes', async () => {
    getTireMock.mockResolvedValue(buildTire());
    renderPage();

    expect(await screen.findByText('Km rodados desde a instalação')).toBeInTheDocument();
    expect((await screen.findAllByText('Indisponível')).length).toBeGreaterThanOrEqual(3);
  });

  it('mostra os valores calculados de distancia, vida util restante e percentual usado', async () => {
    getTireMock.mockResolvedValue(
      buildTire({
        lifecycle: {
          totalCost: 1500,
          interventionsCount: 0,
          daysInstalled: 10,
          costPerKm: { value: 0.05, available: true, reason: null },
          distanceTraveledSinceInstallKm: 30000,
          remainingLifespanKm: 50000,
          lifespanUsedPercent: 37.5,
        },
      }),
    );
    renderPage();

    expect(await screen.findByText('30.000 km')).toBeInTheDocument();
    expect(await screen.findByText('50.000 km')).toBeInTheDocument();
    expect(await screen.findByText('37,5%')).toBeInTheDocument();
  });
});
