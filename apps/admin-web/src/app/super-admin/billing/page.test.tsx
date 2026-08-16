import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/toast';
import type { BillingDashboardEntity, SubscriptionEntity } from '../../../types/entities';
import SuperAdminBillingPage from './page';

const getBillingDashboardMock = vi.fn();
const listSubscriptionsMock = vi.fn();
const listTenantsMock = vi.fn();

vi.mock('../../../lib/api/billing.api', () => ({
  getBillingDashboard: (...args: unknown[]) => getBillingDashboardMock(...args),
  listSubscriptions: (...args: unknown[]) => listSubscriptionsMock(...args),
  createSubscription: vi.fn(),
  registerPayment: vi.fn(),
}));

vi.mock('../../../lib/api/super-admin.api', () => ({
  listTenants: (...args: unknown[]) => listTenantsMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
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
  return render(<SuperAdminBillingPage />, { wrapper: Wrapper });
}

function buildDashboard(overrides: Partial<BillingDashboardEntity> = {}): BillingDashboardEntity {
  return {
    monthlyProjectedRevenue: 4999,
    annualProjectedRevenue: 59988,
    receivedInPeriod: 1500,
    pendingAmount: 800,
    overdueAmount: 300,
    activeSubscriptions: 12,
    totalSubscriptions: 15,
    overdueSubscriptions: 2,
    upcomingDueDates: [],
    ...overrides,
  };
}

function buildSubscription(overrides: Partial<SubscriptionEntity> = {}): SubscriptionEntity {
  return {
    id: 'sub-1',
    tenantId: 'tenant-1',
    tenantName: 'Transportadora Exemplo',
    planTier: 'STARTER',
    amount: 499.9,
    periodicity: 'MONTHLY',
    paymentMethod: 'PIX_SCHEDULED',
    startDate: '2026-06-01T00:00:00.000Z',
    dueDay: 10,
    nextDueDate: '2026-07-10T00:00:00.000Z',
    status: 'ACTIVE',
    daysOverdue: 0,
    notes: null,
    lastPaymentAt: '2026-06-10T00:00:00.000Z',
    lastPaymentStatus: 'PAID',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildList(items: SubscriptionEntity[] = [buildSubscription()]) {
  return { items, meta: { total: items.length, page: 1, pageSize: 20, totalPages: 1 } };
}

describe('SuperAdminBillingPage', () => {
  beforeEach(() => {
    getBillingDashboardMock.mockReset();
    listSubscriptionsMock.mockReset();
    listTenantsMock.mockReset();
    listTenantsMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 100, totalPages: 0 } });
    listSubscriptionsMock.mockResolvedValue(buildList());
    getBillingDashboardMock.mockResolvedValue(buildDashboard());
  });

  it('renderiza os cards do dashboard com dado real', async () => {
    renderPage();

    expect(await screen.findByText('R$ 1.500,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 800,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 300,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 4.999,00')).toBeInTheDocument();
  });

  it('renderiza a listagem de assinaturas com transportadora/plano/valor/status', async () => {
    renderPage();

    expect((await screen.findAllByText('Transportadora Exemplo')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Starter').length).toBeGreaterThan(0);
    expect(screen.getAllByText('R$ 499,90').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ativa').length).toBeGreaterThan(0);
  });

  it('mostra dias em atraso quando a assinatura esta vencida', async () => {
    listSubscriptionsMock.mockResolvedValue(
      buildList([buildSubscription({ status: 'OVERDUE', daysOverdue: 5 })]),
    );
    renderPage();

    expect((await screen.findAllByText('5 dia(s) em atraso')).length).toBeGreaterThan(0);
  });

  it('filtro de status refaz a busca com o filtro aplicado', async () => {
    renderPage();
    await screen.findAllByText('Transportadora Exemplo');
    listSubscriptionsMock.mockClear();

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'OVERDUE' } });

    await waitFor(() =>
      expect(listSubscriptionsMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'OVERDUE' }),
        expect.anything(),
      ),
    );
  });

  it('botao "Nova assinatura" abre o modal de criacao', async () => {
    renderPage();
    await screen.findAllByText('Transportadora Exemplo');

    fireEvent.click(screen.getByRole('button', { name: /Nova assinatura/i }));

    expect(await screen.findByRole('dialog', { name: 'Nova assinatura' })).toBeInTheDocument();
  });
});
