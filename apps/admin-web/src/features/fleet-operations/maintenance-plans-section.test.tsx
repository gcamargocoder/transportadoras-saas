import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import type { MaintenancePlanEntity } from '../../types/entities';
import { MaintenancePlansSection } from './maintenance-plans-section';

const listMaintenancePlansMock = vi.fn();
const registerMaintenancePlanExecutionMock = vi.fn();
const listMaintenancePlanExecutionsMock = vi.fn();

vi.mock('../../lib/api/maintenance-plans.api', () => ({
  listMaintenancePlans: (...args: unknown[]) => listMaintenancePlansMock(...args),
  createMaintenancePlan: vi.fn(),
  updateMaintenancePlan: vi.fn(),
  deleteMaintenancePlan: vi.fn(),
  registerMaintenancePlanExecution: (...args: unknown[]) => registerMaintenancePlanExecutionMock(...args),
  listMaintenancePlanExecutions: (...args: unknown[]) => listMaintenancePlanExecutionsMock(...args),
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
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    status: 'UNKNOWN',
    overdueReason: null,
    dueOdometerKm: null,
    dueDate: null,
    overdueByKm: null,
    overdueByDays: null,
    lastExecution: null,
    ...overrides,
  };
}

// DataTable renderiza tabela (desktop) + cartões (mobile) simultaneamente
// no DOM -- por isso findAllByText/queryAllByText.
describe('MaintenancePlansSection -- status de vencimento', () => {
  beforeEach(() => {
    listMaintenancePlansMock.mockReset();
    registerMaintenancePlanExecutionMock.mockReset();
    listMaintenancePlanExecutionsMock.mockReset();
    listMaintenancePlanExecutionsMock.mockResolvedValue({
      items: [],
      meta: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
    });
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

  it('mostra "Sem histórico" para um plano UNKNOWN, sem detalhe', async () => {
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

  // Fase 81 -- status granular (5 valores) via overdueReason.
  it('mostra "Vencida por KM" / "Vencida por data" / "Vencida pelos dois critérios"', async () => {
    listMaintenancePlansMock.mockResolvedValue({
      items: [
        buildPlan({ id: 'p-km', name: 'Óleo KM', status: 'OVERDUE', overdueReason: 'KM', overdueByKm: 500 }),
        buildPlan({ id: 'p-dt', name: 'Óleo data', status: 'OVERDUE', overdueReason: 'DATE', overdueByDays: 10 }),
        buildPlan({ id: 'p-bt', name: 'Óleo ambos', status: 'OVERDUE', overdueReason: 'BOTH', overdueByDays: 5 }),
      ],
      meta: { page: 1, pageSize: 50, total: 3, totalPages: 1 },
    });
    renderSection();

    expect((await screen.findAllByText('Vencida por KM')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vencida por data').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vencida pelos dois critérios').length).toBeGreaterThan(0);
  });

  it('mostra a última execução quando o plano tem lastExecution', async () => {
    listMaintenancePlansMock.mockResolvedValue({
      items: [buildPlan({ status: 'OK', lastExecution: { executedAt: '2026-08-01T00:00:00.000Z', odometerKm: 90000 } })],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    renderSection();

    await screen.findAllByText('Em dia');
    expect(screen.getAllByText(/90\.000 km/).length).toBeGreaterThan(0);
  });

  it('o formulário de plano tem campo "Observações"', async () => {
    listMaintenancePlansMock.mockResolvedValue({
      items: [],
      meta: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
    });
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Novo plano' }));
    expect(await screen.findByLabelText('Observações')).toBeInTheDocument();
    // campo obrigatorio -> a label vem com "*" anexado, use regex ancorada.
    expect(screen.getByLabelText(/^Descrição \/ serviço/)).toBeInTheDocument();
  });

  it('"Registrar execução" abre o modal e chama a API com os dados informados', async () => {
    listMaintenancePlansMock.mockResolvedValue({
      items: [buildPlan({ status: 'OVERDUE', overdueReason: 'KM', overdueByKm: 500 })],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    registerMaintenancePlanExecutionMock.mockResolvedValue(buildPlan({ status: 'OK' }));
    renderSection();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Registrar execução' }))[0]!);
    fireEvent.change(await screen.findByLabelText('Odômetro (km)'), { target: { value: '105000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(registerMaintenancePlanExecutionMock).toHaveBeenCalledTimes(1));
    expect(registerMaintenancePlanExecutionMock).toHaveBeenCalledWith(
      'plan-1',
      expect.objectContaining({ odometerKm: 105000 }),
    );
  });

  it('"Histórico" lista as execuções registradas', async () => {
    listMaintenancePlansMock.mockResolvedValue({
      items: [buildPlan({ status: 'OK' })],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    listMaintenancePlanExecutionsMock.mockResolvedValue({
      items: [
        { id: 'e1', maintenancePlanId: 'plan-1', vehicleId: 'v1', component: 'ENGINE_OIL', executedAt: '2026-08-10T12:00:00.000Z', odometerKm: 95000, notes: 'feito na oficina X', createdAt: '2026-08-10T12:00:00.000Z' },
      ],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    renderSection();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Histórico' }))[0]!);
    expect(await screen.findByText('feito na oficina X')).toBeInTheDocument();
    expect(screen.getByText(/95\.000 km/)).toBeInTheDocument();
  });
});
