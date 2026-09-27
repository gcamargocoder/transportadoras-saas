import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../../components/ui/toast';
import type { FuelTankEntity, FuelTankMovementEntity } from '../../../../types/entities';
import FuelTankDetailPage from './page';

const getFuelTankMock = vi.fn();
const getFuelTankMovementsMock = vi.fn();
const updateFuelTankStatusMock = vi.fn();
const useAuthMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../../lib/api/fuel-tanks.api', () => ({
  getFuelTank: (...args: unknown[]) => getFuelTankMock(...args),
  getFuelTankMovements: (...args: unknown[]) => getFuelTankMovementsMock(...args),
  updateFuelTankStatus: (...args: unknown[]) => updateFuelTankStatusMock(...args),
  updateFuelTank: vi.fn(),
}));

vi.mock('../../../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'tank-1' }),
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
  return render(<FuelTankDetailPage />, { wrapper: Wrapper });
}

function buildTank(overrides: Partial<FuelTankEntity> = {}): FuelTankEntity {
  return {
    id: 'tank-1',
    tenantId: 't1',
    name: 'Tanque matriz',
    fuelType: 'DIESEL_S10',
    capacityLiters: 15000,
    initialStockLiters: 8000,
    currentStockLiters: 8000,
    minStockLiters: 2000,
    occupancyPercent: 53.3,
    isLowStock: false,
    location: 'Pátio central',
    status: 'ACTIVE',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

function buildMovement(overrides: Partial<FuelTankMovementEntity> = {}): FuelTankMovementEntity {
  return {
    id: 'mov-1',
    tankId: 'tank-1',
    type: 'INITIAL_BALANCE',
    quantityLiters: 8000,
    previousBalanceLiters: 0,
    newBalanceLiters: 8000,
    effectiveDate: '2026-09-01T08:00:00.000Z',
    notes: 'Saldo inicial na criação do tanque.',
    fuelSupplyId: null,
    vehicleId: null,
    driverId: null,
    tripId: null,
    createdBy: 'u1',
    createdAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('FuelTankDetailPage (Gestão de Combustível, Fase 1)', () => {
  beforeEach(() => {
    getFuelTankMock.mockReset();
    getFuelTankMovementsMock.mockReset();
    updateFuelTankStatusMock.mockReset();
    useAuthMock.mockReset();
    pushMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    getFuelTankMovementsMock.mockResolvedValue({ items: [buildMovement()], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } });
  });

  it('mostra o saldo, capacidade e a movimentacao de saldo inicial', async () => {
    getFuelTankMock.mockResolvedValue(buildTank());
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tanque matriz' })).toBeInTheDocument();
    expect(screen.getAllByText('8.000 L').length).toBeGreaterThan(0); // estoque atual e inicial
    expect(screen.getByText('15.000 L')).toBeInTheDocument(); // capacidade
    expect(within(screen.getByRole('table')).getByText('Saldo inicial')).toBeInTheDocument();
  });

  it('mostra badge de estoque baixo quando aplicavel', async () => {
    getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 500, occupancyPercent: 3.3, isLowStock: true }));
    renderPage();

    expect(await screen.findByText('Estoque baixo')).toBeInTheDocument();
  });

  it('ativa/desativa o tanque', async () => {
    getFuelTankMock.mockResolvedValue(buildTank());
    updateFuelTankStatusMock.mockResolvedValue(buildTank({ status: 'INACTIVE' }));
    renderPage();

    const deactivateButton = await screen.findByRole('button', { name: /Desativar/i });
    fireEvent.click(deactivateButton);

    await waitFor(() => expect(updateFuelTankStatusMock).toHaveBeenCalledWith('tank-1', false));
  });

  it('nao mostra acoes de escrita para papel sem permissao', async () => {
    useAuthMock.mockReturnValue({ user: { role: 'AUDITOR' } });
    getFuelTankMock.mockResolvedValue(buildTank());
    renderPage();

    await screen.findByRole('heading', { name: 'Tanque matriz' });
    expect(screen.queryByRole('button', { name: /Desativar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/i })).not.toBeInTheDocument();
  });
});
