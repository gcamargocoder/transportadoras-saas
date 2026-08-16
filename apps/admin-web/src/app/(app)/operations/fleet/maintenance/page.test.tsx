import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../../../components/ui/toast';
import type { FleetMaintenanceDashboardEntity } from '../../../../../types/entities';
import FleetMaintenancePage from './page';

const getFleetOperationsMaintenanceMock = vi.fn();
const listMaintenancesMock = vi.fn();
const listMaintenancePlansMock = vi.fn();
const createMaintenancePlanMock = vi.fn();

vi.mock('../../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsMaintenance: (...args: unknown[]) => getFleetOperationsMaintenanceMock(...args),
}));

vi.mock('../../../../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [] }),
  listFleets: () => Promise.resolve({ items: [] }),
  listMaintenances: (...args: unknown[]) => listMaintenancesMock(...args),
}));

vi.mock('../../../../../lib/api/maintenance-plans.api', () => ({
  listMaintenancePlans: (...args: unknown[]) => listMaintenancePlansMock(...args),
  createMaintenancePlan: (...args: unknown[]) => createMaintenancePlanMock(...args),
  updateMaintenancePlan: vi.fn(),
  deleteMaintenancePlan: vi.fn(),
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
  return render(<FleetMaintenancePage />, { wrapper: Wrapper });
}

function buildMaintenance(overrides: Partial<FleetMaintenanceDashboardEntity> = {}): FleetMaintenanceDashboardEntity {
  return {
    totalCount: 2,
    openCount: 1,
    completedCount: 1,
    cancelledCount: 0,
    scheduledCount: 0,
    preventiveCount: 1,
    correctiveCount: 1,
    totalCost: 400,
    laborCostTotal: 250,
    partsCostTotal: 150,
    averageCostPerOccurrence: 200,
    averageDurationHours: 4,
    totalDowntimeMinutes: 90,
    averageDowntimeMinutes: 90,
    costPerKm: { value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' },
    overdueCount: 0,
    dueSoonCount: 0,
    byType: [
      { type: 'PREVENTIVE', count: 1, cost: 100 },
      { type: 'CORRECTIVE', count: 1, cost: 300 },
    ],
    byPriority: [{ priority: 'MEDIUM', count: 1 }],
    byWorkshop: [
      { workshop: 'Oficina Central', count: 1, cost: 100 },
      { workshop: 'Oficina Norte', count: 1, cost: 300 },
    ],
    byComponent: [{ component: 'ENGINE', count: 1, cost: 100 }],
    topVehiclesByCost: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 400, count: 2 }],
    bottomVehiclesByCost: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 400, count: 2 }],
    topVehiclesByCount: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 2, count: 2 }],
    topVehiclesByDowntime: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 90, count: 2 }],
    topComponentsByCost: [{ component: 'ENGINE', count: 1, cost: 100 }],
    topComponentsByCount: [{ component: 'ENGINE', count: 1, cost: 100 }],
    overdueMaintenances: [],
    upcomingMaintenances: [],
    maintenanceAlerts: [],
    monthlyTrend: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    ...overrides,
  };
}

describe('FleetMaintenancePage', () => {
  beforeEach(() => {
    getFleetOperationsMaintenanceMock.mockReset();
    listMaintenancesMock.mockReset();
    listMaintenancesMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } });
    listMaintenancePlansMock.mockReset();
    listMaintenancePlansMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 50, totalPages: 0 } });
    createMaintenancePlanMock.mockReset();
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

  it('renderiza os cards e os breakdowns por tipo/prioridade/oficina/componente traduzidos em pt-BR', async () => {
    getFleetOperationsMaintenanceMock.mockResolvedValue(buildMaintenance());
    renderPage();

    expect(await screen.findByText('R$ 400,00')).toBeInTheDocument(); // custo total (StatCard)
    // DataTable renderiza tabela (desktop) + cartoes (mobile) simultaneamente
    // no DOM (visibilidade so por CSS) -- por isso getAllByText, nao getByText.
    expect(screen.getAllByText('Preventiva').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Corretiva').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Oficina Central').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Motor').length).toBeGreaterThan(0);
    expect(screen.getByText('Top 5 veículos por nº de manutenções')).toBeInTheDocument();
  });

  it('mostra "—" quando médias chegam null, e "Indisponível" para custo/km sem dado suficiente', async () => {
    getFleetOperationsMaintenanceMock.mockResolvedValue(
      buildMaintenance({ averageCostPerOccurrence: null, averageDurationHours: null }),
    );
    renderPage();

    expect(await screen.findByText('Custo médio/ocorrência')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
  });

  it('exibe alertas com contagem no cabeçalho', async () => {
    getFleetOperationsMaintenanceMock.mockResolvedValue(
      buildMaintenance({
        maintenanceAlerts: [
          { type: 'HIGH_COST', severity: 'ATTENTION', vehicleId: 'v1', plate: 'ABC1D23', message: 'Custo acima da média.', value: 900 },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('Alertas de manutenção')).toBeInTheDocument();
    expect(screen.getByText('1 alerta(s)')).toBeInTheDocument();
    expect(screen.getAllByText('Custo acima da média.').length).toBeGreaterThan(0);
  });

  it('exibe manutencoes vencidas e proximas', async () => {
    getFleetOperationsMaintenanceMock.mockResolvedValue(
      buildMaintenance({
        overdueCount: 1,
        overdueMaintenances: [
          {
            planId: 'p1',
            vehicleId: 'v1',
            vehiclePlate: 'ABC1D23',
            name: 'Troca de óleo',
            component: 'ENGINE_OIL',
            dueOdometerKm: 110000,
            dueDate: null,
            overdueByKm: 1000,
            overdueByDays: null,
          },
        ],
      }),
    );
    renderPage();

    expect((await screen.findAllByText('Manutenções vencidas')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Troca de óleo').length).toBeGreaterThan(0);
  });

  it('carrega e exibe a tabela de registros', async () => {
    getFleetOperationsMaintenanceMock.mockResolvedValue(buildMaintenance());
    listMaintenancesMock.mockResolvedValue({
      items: [
        {
          id: 'm1',
          tenantId: 't1',
          vehicleId: 'v1',
          type: 'PREVENTIVE',
          status: 'COMPLETED',
          priority: 'MEDIUM',
          openedAt: '2026-09-01T08:00:00.000Z',
          scheduledAt: null,
          completedAt: '2026-09-01T10:00:00.000Z',
          odometerKm: 100000,
          workshop: 'Oficina Central',
          supplier: 'Fornecedor X',
          mechanic: null,
          responsibleUserId: null,
          description: null,
          notes: null,
          laborCost: 100,
          partsCost: 50,
          totalCost: 150,
          serviceOrderNumber: null,
          warrantyUntil: null,
          nextReviewAt: null,
          component: 'ENGINE',
          nextOdometerKm: null,
          downtimeMinutes: null,
          invoiceNumber: null,
          maintenancePlanId: null,
          parts: [],
          createdAt: '2026-09-01T08:00:00.000Z',
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    renderPage();

    expect((await screen.findAllByText('Oficina Central')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fornecedor X').length).toBeGreaterThan(0);
  });

  it('gestao de planos: lista vazia mostra estado vazio, criar abre o modal', async () => {
    getFleetOperationsMaintenanceMock.mockResolvedValue(buildMaintenance());
    renderPage();

    expect(await screen.findByText('Planos de manutenção preventiva')).toBeInTheDocument();
    expect(await screen.findByText('Nenhum plano de manutenção cadastrado.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Novo plano'));
    expect(await screen.findByText('Novo plano de manutenção')).toBeInTheDocument();
  });

  it('renderiza o gauge de preventiva/corretiva com o percentual correto', async () => {
    getFleetOperationsMaintenanceMock.mockResolvedValue(buildMaintenance({ totalCount: 4, preventiveCount: 3, correctiveCount: 1 }));
    renderPage();

    expect(await screen.findByText('% preventivas')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('nao quebra o gauge de preventiva/corretiva quando totalCount=0', async () => {
    getFleetOperationsMaintenanceMock.mockResolvedValue(buildMaintenance({ totalCount: 0, preventiveCount: 0, correctiveCount: 0 }));
    renderPage();

    expect(await screen.findByText('Por tipo (distribuição preventiva/corretiva)')).toBeInTheDocument();
    expect(screen.queryByText('% preventivas')).toBeNull();
  });

  it('gestao de planos: exibe plano existente com status', async () => {
    getFleetOperationsMaintenanceMock.mockResolvedValue(buildMaintenance());
    listMaintenancePlansMock.mockResolvedValue({
      items: [
        {
          id: 'plan1',
          vehicleId: 'v1',
          name: 'Troca de óleo',
          component: 'ENGINE_OIL',
          maintenanceType: 'PREVENTIVE',
          intervalKm: 10000,
          intervalDays: null,
          intervalHours: null,
          alertBeforeKm: 1000,
          alertBeforeDays: null,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      meta: { total: 1, page: 1, pageSize: 50, totalPages: 1 },
    });
    renderPage();

    expect((await screen.findAllByText('10000 km')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ativo').length).toBeGreaterThan(0);
  });
});
