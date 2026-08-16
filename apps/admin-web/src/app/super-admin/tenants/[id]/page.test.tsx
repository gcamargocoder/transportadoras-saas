import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../../components/ui/toast';
import type { AuditLogEntity, TenantEntity, TenantUsageEntity } from '../../../../types/entities';
import SuperAdminTenantDetailPage from './page';

const getTenantMock = vi.fn();
const getTenantUsageMock = vi.fn();
const getTenantHistoryMock = vi.fn();
const updateTenantStatusMock = vi.fn();
const updateTenantPlanMock = vi.fn();

vi.mock('../../../../lib/api/super-admin.api', () => ({
  getTenant: (...args: unknown[]) => getTenantMock(...args),
  getTenantUsage: (...args: unknown[]) => getTenantUsageMock(...args),
  getTenantHistory: (...args: unknown[]) => getTenantHistoryMock(...args),
  updateTenantStatus: (...args: unknown[]) => updateTenantStatusMock(...args),
  updateTenantPlan: (...args: unknown[]) => updateTenantPlanMock(...args),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'tenant-1' }),
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
  return render(<SuperAdminTenantDetailPage />, { wrapper: Wrapper });
}

function buildTenant(overrides: Partial<TenantEntity> = {}): TenantEntity {
  return {
    id: 'tenant-1',
    name: 'Transportadora Detalhe',
    tradeName: 'Detalhe Transportes',
    document: '98765432000199',
    slug: 'detalhe',
    logoUrl: null,
    isActive: true,
    status: 'ACTIVE',
    settings: null,
    plan: {
      tier: 'STARTER',
      trialStartedAt: null,
      trialEndsAt: null,
      trialDaysRemaining: null,
      trialExpiringSoon: false,
      maxUsers: null,
      maxVehicles: null,
      maxDrivers: null,
      maxStorageMb: null,
      enabledModules: ['TRIPS', 'TOLLS'],
    },
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-06T00:00:00.000Z',
    ...overrides,
  };
}

function buildUsage(overrides: Partial<TenantUsageEntity> = {}): TenantUsageEntity {
  return {
    users: 3,
    drivers: 8,
    vehicles: 15,
    trips: 42,
    checklistExecutions: 20,
    fuelSupplies: 11,
    maintenances: 6,
    attachments: 9,
    storageUsedMb: 12.5,
    ...overrides,
  };
}

function buildHistory(items: AuditLogEntity[] = []) {
  return { items, meta: { total: items.length, page: 1, pageSize: 10, totalPages: 1 } };
}

describe('SuperAdminTenantDetailPage', () => {
  beforeEach(() => {
    getTenantMock.mockReset();
    getTenantUsageMock.mockReset();
    getTenantHistoryMock.mockReset();
    updateTenantStatusMock.mockReset();
    updateTenantPlanMock.mockReset();
    getTenantUsageMock.mockResolvedValue(buildUsage());
    getTenantHistoryMock.mockResolvedValue(buildHistory([]));
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getTenantMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza dados cadastrais, status e utilização com dado real', async () => {
    getTenantMock.mockResolvedValue(buildTenant());
    renderPage();

    expect(await screen.findByText('Transportadora Detalhe')).toBeInTheDocument();
    expect(screen.getByText('98765432000199')).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeInTheDocument(); // users
    expect(screen.getByText('15')).toBeInTheDocument(); // vehicles
  });

  it('clicar num status diferente chama updateTenantStatus', async () => {
    getTenantMock.mockResolvedValue(buildTenant());
    updateTenantStatusMock.mockResolvedValue(buildTenant({ status: 'SUSPENDED' }));
    renderPage();

    const suspendButton = await screen.findByRole('button', { name: 'Suspensa' });
    fireEvent.click(suspendButton);

    await waitFor(() => expect(updateTenantStatusMock).toHaveBeenCalledWith('tenant-1', 'SUSPENDED'));
  });

  it('salvar plano chama updateTenantPlan com os campos do formulário', async () => {
    getTenantMock.mockResolvedValue(buildTenant());
    updateTenantPlanMock.mockResolvedValue(buildTenant());
    renderPage();

    const saveButton = await screen.findByRole('button', { name: 'Salvar plano' });
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(updateTenantPlanMock).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ tier: 'STARTER', enabledModules: ['TRIPS', 'TOLLS'] }),
      ),
    );
  });
});
