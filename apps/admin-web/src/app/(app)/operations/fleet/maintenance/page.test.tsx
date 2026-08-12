import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetMaintenanceDashboardEntity } from '../../../../../types/entities';
import FleetMaintenancePage from './page';

const getFleetOperationsMaintenanceMock = vi.fn();

vi.mock('../../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsMaintenance: (...args: unknown[]) => getFleetOperationsMaintenanceMock(...args),
}));

vi.mock('../../../../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [] }),
  listFleets: () => Promise.resolve({ items: [] }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<FleetMaintenancePage />, { wrapper: Wrapper });
}

function buildMaintenance(
  overrides: Partial<FleetMaintenanceDashboardEntity> = {},
): FleetMaintenanceDashboardEntity {
  return {
    totalCount: 2,
    openCount: 1,
    completedCount: 1,
    totalCost: 400,
    averageCostPerOccurrence: 200,
    averageDurationHours: 4,
    byType: [
      { type: 'PREVENTIVE', count: 1, cost: 100 },
      { type: 'CORRECTIVE', count: 1, cost: 300 },
    ],
    byPriority: [{ priority: 'MEDIUM', count: 1 }],
    byWorkshop: [
      { workshop: 'Oficina Central', count: 1, cost: 100 },
      { workshop: 'Oficina Norte', count: 1, cost: 300 },
    ],
    topVehiclesByCost: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 400, count: 2 }],
    topVehiclesByCount: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 2, count: 2 }],
    monthlyTrend: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    ...overrides,
  };
}

describe('FleetMaintenancePage', () => {
  beforeEach(() => {
    getFleetOperationsMaintenanceMock.mockReset();
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getFleetOperationsMaintenanceMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getFleetOperationsMaintenanceMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza os cards e os breakdowns por tipo/prioridade/oficina traduzidos em pt-BR', async () => {
    getFleetOperationsMaintenanceMock.mockResolvedValue(buildMaintenance());
    renderPage();

    expect(await screen.findByText('R$ 400,00')).toBeInTheDocument(); // custo total (StatCard)
    // DataTable renderiza tabela (desktop) + cartoes (mobile) simultaneamente
    // no DOM (visibilidade so por CSS) -- por isso getAllByText, nao getByText
    // (mesmo padrao ja usado em operations/page.test.tsx).
    expect(screen.getAllByText('Preventiva').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Corretiva').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Média').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Oficina Central').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Oficina Norte').length).toBeGreaterThan(0);
    expect(screen.getByText('Top 5 veículos por nº de manutenções')).toBeInTheDocument();
  });

  it('mostra "—" (nunca "R$ 0,00"/"0h") quando médias chegam null', async () => {
    getFleetOperationsMaintenanceMock.mockResolvedValue(
      buildMaintenance({ averageCostPerOccurrence: null, averageDurationHours: null }),
    );
    renderPage();

    expect(await screen.findByText('Custo médio/ocorrência')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});
