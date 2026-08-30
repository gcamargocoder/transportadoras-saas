import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import type { MaintenancePlanEntity } from '../../types/entities';
import { MaintenancePlansSection } from './maintenance-plans-section';

const listMaintenancePlansMock = vi.fn();

vi.mock('../../lib/api/maintenance-plans.api', () => ({
  listMaintenancePlans: (...args: unknown[]) => listMaintenancePlansMock(...args),
  createMaintenancePlan: vi.fn(),
  updateMaintenancePlan: vi.fn(),
  deleteMaintenancePlan: vi.fn(),
}));

vi.mock('../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [] }),
}));

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<MaintenancePlansSection vehicleId="" />, { wrapper: Wrapper });
}

function buildPlan(overrides: Partial<MaintenancePlanEntity> = {}): MaintenancePlanEntity {
  return {
    id: 'plan-1',
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
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    status: 'UNKNOWN',
    dueOdometerKm: null,
    dueDate: null,
    overdueByKm: null,
    overdueByDays: null,
    ...overrides,
  };
}

// Fase 108 -- fecha a lacuna real de "informacao operacional relevante no
// veiculo": ate aqui a listagem de planos so mostrava Ativo/Inativo, nunca
// se o plano estava vencido/proximo (o dashboard de frota ja calculava isso,
// mas so aparecia la, nunca na propria tela de gestao dos planos).
describe('MaintenancePlansSection -- status de vencimento (Fase 108)', () => {
  beforeEach(() => {
    listMaintenancePlansMock.mockReset();
  });

  // DataTable renderiza tabela (desktop) + cartões (mobile) simultaneamente
  // no DOM (visibilidade só por CSS) -- por isso findAllByText/queryAllByText,
  // nunca findByText/getByText (mesmo padrão já usado em outras páginas com
  // DataTable, ex.: reconciliation-tab.test.tsx).
  it('mostra "Vencida" com o detalhe em km para um plano OVERDUE', async () => {
    listMaintenancePlansMock.mockResolvedValue({
      items: [buildPlan({ status: 'OVERDUE', overdueByKm: 500 })],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    renderSection();

    expect((await screen.findAllByText('Vencida')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('há 500 km').length).toBeGreaterThan(0);
  });

  it('mostra "Próxima" para um plano DUE_SOON', async () => {
    listMaintenancePlansMock.mockResolvedValue({
      items: [buildPlan({ status: 'DUE_SOON', dueOdometerKm: 100000 })],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    renderSection();

    expect((await screen.findAllByText('Próxima')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('aos 100.000 km').length).toBeGreaterThan(0);
  });

  it('mostra "Sem histórico" (nunca inventa vencimento) para um plano UNKNOWN, sem detalhe', async () => {
    listMaintenancePlansMock.mockResolvedValue({
      items: [buildPlan({ status: 'UNKNOWN' })],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    renderSection();

    expect((await screen.findAllByText('Sem histórico')).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/há |aos /)).toHaveLength(0);
  });

  it('mostra "Em dia" para um plano OK', async () => {
    listMaintenancePlansMock.mockResolvedValue({
      items: [buildPlan({ status: 'OK', dueOdometerKm: 100000 })],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    renderSection();

    expect((await screen.findAllByText('Em dia')).length).toBeGreaterThan(0);
  });
});
