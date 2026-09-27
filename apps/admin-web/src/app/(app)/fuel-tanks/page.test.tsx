import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/toast';
import type { FuelTankEntity } from '../../../types/entities';
import FuelTanksPage from './page';

const listFuelTanksMock = vi.fn();
const updateFuelTankStatusMock = vi.fn();
const useAuthMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../lib/api/fuel-tanks.api', () => ({
  listFuelTanks: (...args: unknown[]) => listFuelTanksMock(...args),
  updateFuelTankStatus: (...args: unknown[]) => updateFuelTankStatusMock(...args),
  createFuelTank: vi.fn(),
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
  return render(<FuelTanksPage />, { wrapper: Wrapper });
}

function buildTank(overrides: Partial<FuelTankEntity> = {}): FuelTankEntity {
  return {
    id: 'tank-1',
    tenantId: 't1',
    name: 'Tanque matriz',
    fuelType: 'DIESEL_S10',
    capacityLiters: 15000,
    initialStockLiters: 8000,
    currentStockLiters: 500,
    minStockLiters: 2000,
    occupancyPercent: 3.3,
    isLowStock: true,
    location: 'Pátio central',
    status: 'ACTIVE',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('FuelTanksPage (Gestão de Combustível, Fase 1)', () => {
  beforeEach(() => {
    listFuelTanksMock.mockReset();
    updateFuelTankStatusMock.mockReset();
    useAuthMock.mockReset();
    pushMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
  });

  it('mostra estado vazio quando nao ha tanques', async () => {
    listFuelTanksMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } });
    renderPage();
    expect(await screen.findByText('Nenhum tanque encontrado')).toBeInTheDocument();
  });

  it('renderiza a listagem com badge de estoque baixo', async () => {
    listFuelTanksMock.mockResolvedValue({ items: [buildTank()], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } });
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Tanque matriz')).toBeInTheDocument();
    expect(within(table).getByText('Estoque baixo')).toBeInTheDocument();
  });

  it('filtra por estoque baixo', async () => {
    listFuelTanksMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } });
    renderPage();
    await screen.findByText('Nenhum tanque encontrado');

    fireEvent.change(screen.getByLabelText('Estoque baixo'), { target: { value: 'true' } });

    await waitFor(() => expect(listFuelTanksMock).toHaveBeenCalledWith(expect.objectContaining({ lowStock: true }), expect.anything()));
  });

  it('nao mostra acoes de escrita para papel sem permissao', async () => {
    useAuthMock.mockReturnValue({ user: { role: 'AUDITOR' } });
    listFuelTanksMock.mockResolvedValue({ items: [buildTank()], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } });
    renderPage();

    await screen.findByRole('table');
    expect(screen.queryByText('Novo tanque')).not.toBeInTheDocument();
  });
});
