import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import type { SubscriptionEntity } from '../../types/entities';
import { EditSubscriptionModal } from './edit-subscription-modal';

const updateSubscriptionMock = vi.fn();

vi.mock('../../lib/api/billing.api', () => ({
  updateSubscription: (...args: unknown[]) => updateSubscriptionMock(...args),
}));

function buildSubscription(overrides: Partial<SubscriptionEntity> = {}): SubscriptionEntity {
  return {
    id: 'sub-1',
    tenantId: 'tenant-1',
    tenantName: 'Transportadora X',
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
    lastPaymentAt: null,
    lastPaymentStatus: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderModal(subscription: SubscriptionEntity | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return render(<EditSubscriptionModal subscription={subscription} onClose={vi.fn()} />, { wrapper: Wrapper });
}

describe('EditSubscriptionModal', () => {
  beforeEach(() => {
    updateSubscriptionMock.mockReset();
  });

  it('pre-preenche os campos com os dados atuais da assinatura', () => {
    renderModal(buildSubscription());
    expect(screen.getByLabelText('Valor (R$)', { exact: false })).toHaveValue(499.9);
    expect(screen.getByLabelText('Status', { exact: false })).toHaveValue('ACTIVE');
  });

  it('cancelamento envia status=CANCELLED pelo mesmo formulario de edicao', async () => {
    updateSubscriptionMock.mockResolvedValue({ id: 'sub-1', status: 'CANCELLED' });
    renderModal(buildSubscription());

    fireEvent.change(screen.getByLabelText('Status', { exact: false }), { target: { value: 'CANCELLED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(updateSubscriptionMock).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ status: 'CANCELLED' }),
      ),
    );
  });
});
