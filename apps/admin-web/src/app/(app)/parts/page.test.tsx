import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/toast';
import type { PartEntity, PartsDashboardEntity } from '../../../types/entities';
import PartsPage from './page';

const listPartsMock = vi.fn();
const getPartsDashboardMock = vi.fn();
const updatePartStatusMock = vi.fn();
const useAuthMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../lib/api/parts.api', () => ({
  listParts: (...args: unknown[]) => listPartsMock(...args),
  getPartsDashboard: (...args: unknown[]) => getPartsDashboardMock(...args),
  updatePartStatus: (...args: unknown[]) => updatePartStatusMock(...args),
  createPart: vi.fn(),
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
  return render(<PartsPage />, { wrapper: Wrapper });
}

function buildDashboard(overrides: Partial<PartsDashboardEntity> = {}): PartsDashboardEntity {
  return {
    totalParts: 2,
    activeParts: 2,
    inactiveParts: 0,
    lowStockCount: 1,
    zeroStockCount: 0,
    estimatedStockValue: 150,
    estimatedStockValueUnavailableReason: null,
    partsWithoutKnownCost: 0,
    entriesInPeriod: 30,
    exitsInPeriod: 10,
    ...overrides,
  };
}

function buildPart(overrides: Partial<PartEntity> = {}): PartEntity {
  return {
    id: 'p1',
    tenantId: 't1',
    sku: 'FLT-001',
    name: 'Filtro de óleo',
    description: null,
    unit: 'UN',
    category: 'Filtros',
    manufacturer: null,
    oemCode: null,
    minStock: 5,
    currentStock: 3,
    isLowStock: true,
    isZeroStock: false,
    isActive: true,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('PartsPage (Fase 83)', () => {
  beforeEach(() => {
    listPartsMock.mockReset();
    getPartsDashboardMock.mockReset();
    updatePartStatusMock.mockReset();
    useAuthMock.mockReset();
    pushMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    getPartsDashboardMock.mockResolvedValue(buildDashboard());
  });

  it('mostra estado vazio quando nao ha pecas', async () => {
    listPartsMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } });
    renderPage();
    expect(await screen.findByText('Nenhuma peça encontrada')).toBeInTheDocument();
  });

  it('renderiza os KPIs do dashboard e a listagem com badge de estoque baixo', async () => {
    listPartsMock.mockResolvedValue({ items: [buildPart()], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } });
    renderPage();

    expect(await screen.findByText('FLT-001')).toBeInTheDocument();
    expect(screen.getByText('Baixo')).toBeInTheDocument();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0); // totalParts/activeParts
  });

  it('filtra por estoque baixo', async () => {
    listPartsMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } });
    renderPage();
    await screen.findByText('Nenhuma peça encontrada');

    fireEvent.change(screen.getByLabelText('Estoque baixo'), { target: { value: 'true' } });

    await waitFor(() => expect(listPartsMock).toHaveBeenCalledWith(expect.objectContaining({ lowStock: true }), expect.anything()));
  });
});
