import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformDashboardEntity } from '../../types/entities';
import SuperAdminDashboardPage from './page';

const getPlatformDashboardMock = vi.fn();

vi.mock('../../lib/api/super-admin.api', () => ({
  getPlatformDashboard: (...args: unknown[]) => getPlatformDashboardMock(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<SuperAdminDashboardPage />, { wrapper: Wrapper });
}

function buildDashboard(overrides: Partial<PlatformDashboardEntity> = {}): PlatformDashboardEntity {
  return {
    // Cada contagem simples precisa ser unica no fixture -- StatCard
    // renderiza so o numero puro, getByText falha com "multiplos
    // elementos" se dois cards coincidirem.
    totalTenants: 42,
    byStatus: [
      { status: 'ACTIVE', count: 30 },
      { status: 'TRIAL', count: 5 },
      { status: 'SUSPENDED', count: 4 },
      { status: 'EXPIRED', count: 3 },
    ],
    totalUsers: 120,
    totalVehicles: 88,
    totalDrivers: 65,
    byPlanTier: [
      { tier: 'STARTER', count: 20 },
      { tier: 'PROFESSIONAL', count: 15 },
    ],
    tripsCompletedLast30Days: 210,
    checklistsCompletedLast30Days: 190,
    ...overrides,
  };
}

describe('SuperAdminDashboardPage', () => {
  beforeEach(() => {
    getPlatformDashboardMock.mockReset();
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getPlatformDashboardMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getPlatformDashboardMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza os totais e o breakdown por status com dado real', async () => {
    getPlatformDashboardMock.mockResolvedValue(buildDashboard());
    renderPage();

    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('65')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Suspensa')).toBeInTheDocument();
    expect(screen.getByText('210')).toBeInTheDocument();
    expect(screen.getByText('190')).toBeInTheDocument();
  });
});
