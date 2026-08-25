import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/toast';
import type { MaintenanceProviderEntity } from '../../../types/entities';
import WorkshopsPage from './page';

const listMaintenanceProvidersMock = vi.fn();
const updateMaintenanceProviderStatusMock = vi.fn();
const useAuthMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../lib/api/maintenance-providers.api', () => ({
  listMaintenanceProviders: (...args: unknown[]) => listMaintenanceProvidersMock(...args),
  updateMaintenanceProviderStatus: (...args: unknown[]) => updateMaintenanceProviderStatusMock(...args),
  createMaintenanceProvider: vi.fn(),
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
  return render(<WorkshopsPage />, { wrapper: Wrapper });
}

function buildProvider(overrides: Partial<MaintenanceProviderEntity> = {}): MaintenanceProviderEntity {
  return {
    id: 'p1',
    tenantId: 't1',
    type: 'WORKSHOP',
    name: 'Oficina Central',
    tradeName: null,
    document: '12345678000199',
    phone: '(41) 3222-1100',
    email: null,
    address: null,
    contactName: null,
    specialties: null,
    notes: null,
    isActive: true,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('WorkshopsPage (Fase 84)', () => {
  beforeEach(() => {
    listMaintenanceProvidersMock.mockReset();
    updateMaintenanceProviderStatusMock.mockReset();
    useAuthMock.mockReset();
    pushMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
  });

  it('mostra estado vazio quando nao ha oficinas', async () => {
    listMaintenanceProvidersMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } });
    renderPage();
    expect(await screen.findByText('Nenhuma oficina encontrada')).toBeInTheDocument();
  });

  it('renderiza a listagem e filtra por status', async () => {
    listMaintenanceProvidersMock.mockResolvedValue({
      items: [buildProvider()],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    renderPage();

    expect((await screen.findAllByText('Oficina Central')).length).toBeGreaterThan(0);
    expect(listMaintenanceProvidersMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'WORKSHOP' }), expect.anything());

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'true' } });
    await waitFor(() =>
      expect(listMaintenanceProvidersMock).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'WORKSHOP', isActive: true }),
        expect.anything(),
      ),
    );
  });
});
