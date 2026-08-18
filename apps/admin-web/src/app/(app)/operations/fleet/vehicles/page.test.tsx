import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetVehiclesOverviewEntity } from '../../../../../types/entities';
import FleetVehiclesOverviewPage from './page';

const getFleetOperationsVehiclesMock = vi.fn();

vi.mock('../../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsVehicles: (...args: unknown[]) => getFleetOperationsVehiclesMock(...args),
}));

vi.mock('../../../../../lib/api/fleet.api', () => ({
  listFleets: () => Promise.resolve({ items: [] }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<FleetVehiclesOverviewPage />, { wrapper: Wrapper });
}

function buildOverview(overrides: Partial<FleetVehiclesOverviewEntity> = {}): FleetVehiclesOverviewEntity {
  return {
    totalVehicles: 12,
    activeCount: 10,
    inactiveCount: 1,
    suspendedCount: 0,
    maintenanceCount: 1,
    soldCount: 0,
    vehiclesOnTrip: 4,
    vehiclesAvailable: 6,
    byType: [
      { type: 'TRACTOR_UNIT', count: 8 },
      { type: 'TRUCK', count: 4 },
    ],
    byStatus: [
      { status: 'ACTIVE', count: 10 },
      { status: 'INACTIVE', count: 1 },
      { status: 'MAINTENANCE', count: 1 },
    ],
    byOwnershipType: [
      { ownershipType: 'OWN', count: 10 },
      { ownershipType: 'AGGREGATED', count: 2 },
    ],
    byFuelType: [{ fuelType: 'DIESEL_S10', count: 12 }],
    byFleet: [
      { fleetId: 'f1', fleetName: 'Frota SP', count: 8 },
      { fleetId: null, fleetName: 'Sem frota', count: 4 },
    ],
    averageAgeYears: { value: 6, available: true, reason: null },
    averageOdometerKm: { value: 85000, available: true, reason: null },
    oldestVehicles: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 2010, count: 2010 }],
    newestVehicles: [{ vehicleId: 'v2', plate: 'XYZ9A88', value: 2024, count: 2024 }],
    topVehiclesByOdometer: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 320000, count: 320000 }],
    ...overrides,
  };
}

describe('FleetVehiclesOverviewPage', () => {
  beforeEach(() => {
    getFleetOperationsVehiclesMock.mockReset();
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getFleetOperationsVehiclesMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getFleetOperationsVehiclesMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza os cards com dado real', async () => {
    getFleetOperationsVehiclesMock.mockResolvedValue(buildOverview());
    renderPage();

    expect(await screen.findByText('12')).toBeInTheDocument(); // total
    // "10" (ativos) tambem aparece na tabela "Por status" (DataTable
    // renderiza desktop+mobile simultaneamente no DOM) -- por isso
    // getAllByText, nao getByText.
    expect(screen.getAllByText('10').length).toBeGreaterThan(0);
    expect(screen.getByText('6 anos')).toBeInTheDocument(); // idade media
    expect(screen.getByText('85.000 km')).toBeInTheDocument(); // odometro medio
  });

  it('mostra "Indisponível" quando idade/odômetro médios não estão disponíveis', async () => {
    getFleetOperationsVehiclesMock.mockResolvedValue(
      buildOverview({
        averageAgeYears: { value: null, available: false, reason: 'NO_VEHICLE_WITH_MANUFACTURE_YEAR' },
        averageOdometerKm: { value: null, available: false, reason: 'NO_VEHICLE_WITH_ODOMETER' },
      }),
    );
    renderPage();

    expect(await screen.findByText('Idade média')).toBeInTheDocument();
    expect(screen.getAllByText('Indisponível').length).toBe(2);
  });

  it('renderiza os breakdowns por status e por frota, incluindo "Sem frota"', async () => {
    getFleetOperationsVehiclesMock.mockResolvedValue(buildOverview());
    renderPage();

    expect(await screen.findByText('Por status')).toBeInTheDocument();
    expect(screen.getAllByText('Ativo').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Frota SP').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sem frota').length).toBeGreaterThan(0);
  });

  it('renderiza os rankings de mais antigo/mais novo/maior odômetro com link para o veículo', async () => {
    getFleetOperationsVehiclesMock.mockResolvedValue(buildOverview());
    renderPage();

    expect(await screen.findByText('Veículos mais antigos')).toBeInTheDocument();
    const link = screen.getAllByRole('link', { name: 'ABC1D23' })[0];
    expect(link).toHaveAttribute('href', '/vehicles/v1');
  });

  it('mostra mensagem vazia nos rankings quando não há veículo com o dado', async () => {
    getFleetOperationsVehiclesMock.mockResolvedValue(buildOverview({ oldestVehicles: [], newestVehicles: [] }));
    renderPage();

    expect(await screen.findAllByText('Nenhum veículo com ano de fabricação cadastrado.')).toHaveLength(2);
  });

  it('filtra por tipo de veículo', async () => {
    getFleetOperationsVehiclesMock.mockResolvedValue(buildOverview());
    renderPage();
    await screen.findByText('12');

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'TRUCK' } });

    await waitFor(() =>
      expect(getFleetOperationsVehiclesMock).toHaveBeenLastCalledWith(expect.objectContaining({ vehicleType: 'TRUCK' }), expect.anything()),
    );
  });

  it('link "Ver todos os veículos" aponta para /vehicles', async () => {
    getFleetOperationsVehiclesMock.mockResolvedValue(buildOverview());
    renderPage();

    const link = await screen.findByRole('link', { name: 'Ver todos os veículos →' });
    expect(link).toHaveAttribute('href', '/vehicles');
  });
});
