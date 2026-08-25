import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/toast';
import MaintenancesPage from './page';

const listMaintenancesMock = vi.fn();
const createMaintenanceMock = vi.fn();
const useAuthMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../lib/api/fleet.api', () => ({
  listMaintenances: (...args: unknown[]) => listMaintenancesMock(...args),
  createMaintenance: (...args: unknown[]) => createMaintenanceMock(...args),
  listVehicles: () =>
    Promise.resolve({ items: [{ id: '11111111-1111-1111-1111-111111111111', plate: 'ABC1D23', brand: 'Volvo', model: 'FH' }] }),
}));

vi.mock('../../../lib/api/maintenance-providers.api', () => ({
  listMaintenanceProviders: () => Promise.resolve({ items: [], meta: { total: 0, page: 1, pageSize: 100, totalPages: 0 } }),
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
  return render(<MaintenancesPage />, { wrapper: Wrapper });
}

describe('MaintenancesPage', () => {
  beforeEach(() => {
    listMaintenancesMock.mockReset();
    listMaintenancesMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } });
    createMaintenanceMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    pushMock.mockReset();
  });

  it('mostra estado vazio quando nao ha manutencoes', async () => {
    renderPage();
    expect(await screen.findByText('Nenhuma manutenção encontrada')).toBeInTheDocument();
  });

  it('filtra por componente', async () => {
    renderPage();
    await screen.findByText('Nenhuma manutenção encontrada');

    fireEvent.change(screen.getByLabelText('Componente'), { target: { value: 'ENGINE' } });

    await waitFor(() =>
      expect(listMaintenancesMock).toHaveBeenCalledWith(expect.objectContaining({ component: 'ENGINE' }), expect.anything()),
    );
  });

  it('exibe coluna de componente na tabela', async () => {
    listMaintenancesMock.mockResolvedValue({
      items: [
        {
          id: 'm1',
          tenantId: 't1',
          vehicleId: 'v1',
          type: 'PREVENTIVE',
          status: 'OPEN',
          priority: 'MEDIUM',
          openedAt: '2026-09-01T08:00:00.000Z',
          scheduledAt: null,
          completedAt: null,
          odometerKm: null,
          workshop: 'Oficina Central',
          supplier: null,
          mechanic: null,
          responsibleUserId: null,
          description: null,
          notes: null,
          laborCost: null,
          partsCost: null,
          totalCost: null,
          serviceOrderNumber: null,
          warrantyUntil: null,
          nextReviewAt: null,
          component: 'BRAKES',
          nextOdometerKm: null,
          downtimeMinutes: null,
          invoiceNumber: null,
          maintenancePlanId: null,
          parts: [],
          createdAt: '2026-09-01T08:00:00.000Z',
          updatedAt: '2026-09-01T08:00:00.000Z',
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    renderPage();

    expect((await screen.findAllByText('Freio')).length).toBeGreaterThan(0);
  });

  it('botão "Nova manutenção" fica oculto para OPERATOR (sem FLEET_WRITE_ROLES)', async () => {
    useAuthMock.mockReturnValue({ user: { role: 'OPERATOR' } });
    renderPage();
    await screen.findByText('Nenhuma manutenção encontrada');
    expect(screen.queryByText('Nova manutenção')).toBeNull();
  });

  it('cria manutenção com componente selecionado', async () => {
    createMaintenanceMock.mockResolvedValue({ id: 'm1' });
    renderPage();
    await screen.findByText('Nenhuma manutenção encontrada');

    fireEvent.click(screen.getByText('Nova manutenção'));
    await screen.findByText('Nova manutenção', { selector: 'h2' });
    const modal = within(screen.getByRole('dialog'));
    await modal.findByText('ABC1D23 · Volvo FH'); // aguarda listVehicles resolver

    fireEvent.change(modal.getByLabelText('Veículo', { exact: false }), {
      target: { value: '11111111-1111-1111-1111-111111111111' },
    });
    fireEvent.change(modal.getByLabelText('Componente', { exact: false }), { target: { value: 'ENGINE' } });
    fireEvent.click(modal.getByText('Registrar'));

    await waitFor(() =>
      expect(createMaintenanceMock).toHaveBeenCalledWith(
        expect.objectContaining({ vehicleId: '11111111-1111-1111-1111-111111111111', component: 'ENGINE' }),
      ),
    );
  });
});
