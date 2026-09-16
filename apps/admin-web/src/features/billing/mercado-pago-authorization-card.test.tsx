import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import { MercadoPagoAuthorizationCard } from './mercado-pago-authorization-card';

const getMySubscriptionMock = vi.fn();
const createMercadoPagoAuthorizationMock = vi.fn();

vi.mock('../../lib/api/billing.api', () => ({
  getMySubscription: (...args: unknown[]) => getMySubscriptionMock(...args),
  createMercadoPagoAuthorization: (...args: unknown[]) => createMercadoPagoAuthorizationMock(...args),
}));

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return render(<MercadoPagoAuthorizationCard />, { wrapper: Wrapper });
}

describe('MercadoPagoAuthorizationCard', () => {
  beforeEach(() => {
    getMySubscriptionMock.mockReset();
    createMercadoPagoAuthorizationMock.mockReset();
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  it('nao renderiza nada quando o tenant nao tem assinatura Mercado Pago', async () => {
    getMySubscriptionMock.mockResolvedValue({ paymentMethod: 'PIX_SCHEDULED', status: 'ACTIVE' });
    renderCard();
    await waitFor(() => expect(getMySubscriptionMock).toHaveBeenCalled());
    expect(screen.queryByText('Cobrança automática')).not.toBeInTheDocument();
  });

  it('nao renderiza nada quando o tenant nao tem assinatura cadastrada (404)', async () => {
    getMySubscriptionMock.mockRejectedValue(new Error('not found'));
    renderCard();
    await waitFor(() => expect(getMySubscriptionMock).toHaveBeenCalled());
    expect(screen.queryByText('Cobrança automática')).not.toBeInTheDocument();
  });

  it('mostra o botao de autorizar quando o status e PENDING e redireciona ao clicar', async () => {
    getMySubscriptionMock.mockResolvedValue({
      paymentMethod: 'MERCADO_PAGO',
      status: 'PENDING',
      nextDueDate: '2026-10-01',
    });
    createMercadoPagoAuthorizationMock.mockResolvedValue({ initPoint: 'https://mercadopago.com/checkout/xyz' });
    renderCard();

    const button = await screen.findByRole('button', { name: 'Autorizar no Mercado Pago' });
    await userEvent.click(button);

    await waitFor(() => expect(window.location.href).toBe('https://mercadopago.com/checkout/xyz'));
  });

  it('esconde o botao de autorizar quando o status ja e ACTIVE', async () => {
    getMySubscriptionMock.mockResolvedValue({
      paymentMethod: 'MERCADO_PAGO',
      status: 'ACTIVE',
      nextDueDate: '2026-10-01',
    });
    renderCard();

    await screen.findByText('Cobrança automática');
    expect(screen.queryByRole('button', { name: 'Autorizar no Mercado Pago' })).not.toBeInTheDocument();
  });
});
