import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import type { SubscriptionEntity } from '../../types/entities';
import { RegisterPaymentModal } from './register-payment-modal';

const registerPaymentMock = vi.fn();

vi.mock('../../lib/api/billing.api', () => ({
  registerPayment: (...args: unknown[]) => registerPaymentMock(...args),
}));

function buildSubscription(): SubscriptionEntity {
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
  };
}

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return render(<RegisterPaymentModal subscription={buildSubscription()} onClose={vi.fn()} />, { wrapper: Wrapper });
}

describe('RegisterPaymentModal', () => {
  beforeEach(() => {
    registerPaymentMock.mockReset();
  });

  it('pre-preenche valor e metodo a partir da assinatura, com status default PAID', () => {
    renderModal();
    expect(screen.getByLabelText('Valor (R$)', { exact: false })).toHaveValue(499.9);
    expect(screen.getByLabelText('Status', { exact: false })).toHaveValue('PAID');
  });

  it('registra o pagamento com os dados do formulario', async () => {
    registerPaymentMock.mockResolvedValue({ id: 'payment-1' });
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() =>
      expect(registerPaymentMock).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ amount: 499.9, paymentMethod: 'PIX_SCHEDULED', status: 'PAID' }),
      ),
    );
  });
});
