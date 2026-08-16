import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import { CreateSubscriptionModal } from './create-subscription-modal';

const createSubscriptionMock = vi.fn();
const listTenantsMock = vi.fn();

vi.mock('../../lib/api/billing.api', () => ({
  createSubscription: (...args: unknown[]) => createSubscriptionMock(...args),
}));

vi.mock('../../lib/api/super-admin.api', () => ({
  listTenants: (...args: unknown[]) => listTenantsMock(...args),
}));

function renderModal(props: Partial<React.ComponentProps<typeof CreateSubscriptionModal>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return render(
    <CreateSubscriptionModal open onClose={vi.fn()} tenantId="11111111-1111-1111-1111-111111111111" tenantName="Transportadora X" {...props} />,
    { wrapper: Wrapper },
  );
}

describe('CreateSubscriptionModal', () => {
  beforeEach(() => {
    createSubscriptionMock.mockReset();
    listTenantsMock.mockReset();
    listTenantsMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 100, totalPages: 0 } });
  });

  it('quando tenantId/tenantName ja vem definido, mostra o nome fixo em vez do seletor', () => {
    renderModal();
    expect(screen.getByDisplayValue('Transportadora X')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Transportadora/i })).not.toBeInTheDocument();
  });

  it('envia os dados preenchidos para createSubscription', async () => {
    createSubscriptionMock.mockResolvedValue({ id: 'sub-1' });
    renderModal();

    fireEvent.change(screen.getByLabelText('Plano comercial', { exact: false }), { target: { value: 'STARTER' } });
    fireEvent.change(screen.getByLabelText('Valor (R$)', { exact: false }), { target: { value: '499.90' } });
    fireEvent.change(screen.getByLabelText('Periodicidade', { exact: false }), { target: { value: 'MONTHLY' } });
    fireEvent.change(screen.getByLabelText('Método de pagamento', { exact: false }), {
      target: { value: 'PIX_SCHEDULED' },
    });
    fireEvent.change(screen.getByLabelText('Data de início', { exact: false }), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('Dia do vencimento', { exact: false }), { target: { value: '10' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar assinatura' }));

    await waitFor(() =>
      expect(createSubscriptionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: '11111111-1111-1111-1111-111111111111',
          planTier: 'STARTER',
          amount: 499.9,
          periodicity: 'MONTHLY',
          paymentMethod: 'PIX_SCHEDULED',
          dueDay: 10,
        }),
      ),
    );
  });
});
