import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/toast';
import type { Paginated } from '../../../types/api';
import type { TenantListItemEntity } from '../../../types/entities';
import SuperAdminTenantsPage from './page';

const listTenantsMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../lib/api/super-admin.api', () => ({
  listTenants: (...args: unknown[]) => listTenantsMock(...args),
  createTenant: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return render(<SuperAdminTenantsPage />, { wrapper: Wrapper });
}

function buildTenant(overrides: Partial<TenantListItemEntity> = {}): TenantListItemEntity {
  return {
    id: 't1',
    name: 'Transportadora Exemplo',
    tradeName: 'Exemplo Transportes',
    document: '12345678000199',
    slug: 'exemplo',
    logoUrl: null,
    isActive: true,
    status: 'ACTIVE',
    settings: null,
    plan: {
      tier: 'PROFESSIONAL',
      trialStartedAt: null,
      trialEndsAt: null,
      trialDaysRemaining: null,
      trialExpiringSoon: false,
      maxUsers: null,
      maxVehicles: null,
      maxDrivers: null,
      maxStorageMb: null,
      enabledModules: ['TRIPS'],
    },
    userCount: 7,
    vehicleCount: 12,
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
    ...overrides,
  };
}

function buildResponse(items: TenantListItemEntity[]): Paginated<TenantListItemEntity> {
  return { items, meta: { total: items.length, page: 1, pageSize: 20, totalPages: 1 } };
}

describe('SuperAdminTenantsPage', () => {
  beforeEach(() => {
    listTenantsMock.mockReset();
    pushMock.mockReset();
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    listTenantsMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    await waitFor(() => expect(listTenantsMock).toHaveBeenCalled());
  });

  it('renderiza a listagem com status/plano/contagens reais', async () => {
    listTenantsMock.mockResolvedValue(buildResponse([buildTenant()]));
    renderPage();

    expect(await screen.findAllByText('Transportadora Exemplo')).toHaveLength(2); // desktop + mobile
    expect(screen.getAllByText('Ativa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Profissional').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12').length).toBeGreaterThan(0);
  });

  it('chama listTenants com os filtros mapeados (search/status)', async () => {
    listTenantsMock.mockResolvedValue(buildResponse([]));
    renderPage();

    await waitFor(() => expect(listTenantsMock).toHaveBeenCalled());
    expect(listTenantsMock).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, search: undefined, status: undefined }),
      expect.anything(),
    );
  });

  it('clique na linha navega para /super-admin/tenants/:id', async () => {
    listTenantsMock.mockResolvedValue(buildResponse([buildTenant({ id: 'target-id' })]));
    renderPage();

    const [firstCell] = await screen.findAllByText('Transportadora Exemplo');
    expect(firstCell).toBeTruthy();
    fireEvent.click(firstCell as HTMLElement);

    expect(pushMock).toHaveBeenCalledWith('/super-admin/tenants/target-id');
  });
});
