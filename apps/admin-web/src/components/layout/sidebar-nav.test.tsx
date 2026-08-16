import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarNav } from './sidebar-nav';

const useAuthMock = vi.fn();
const useTenantPlanMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../hooks/use-tenant-plan', () => ({
  useTenantPlan: () => useTenantPlanMock(),
}));

describe('SidebarNav', () => {
  afterEach(() => {
    useAuthMock.mockClear();
    useTenantPlanMock.mockClear();
  });

  it('esconde itens de modulo desabilitado no plano do tenant', () => {
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    useTenantPlanMock.mockReturnValue({
      plan: { enabledModules: ['TRIPS'] },
      isLoading: false,
    });

    render(<SidebarNav />);

    expect(screen.getByText('Viagens')).toBeInTheDocument();
    expect(screen.queryByText('Pneus')).not.toBeInTheDocument();
    expect(screen.queryByText('Manutenções')).not.toBeInTheDocument();
  });

  it('SUPER_ADMIN nunca tem itens escondidos por modulo, mesmo com o plano vazio', () => {
    useAuthMock.mockReturnValue({ user: { role: 'SUPER_ADMIN' } });
    useTenantPlanMock.mockReturnValue({ plan: { enabledModules: [] }, isLoading: false });

    render(<SidebarNav />);

    expect(screen.getByText('Viagens')).toBeInTheDocument();
    expect(screen.getByText('Pneus')).toBeInTheDocument();
  });

  it('enquanto o plano ainda esta carregando (null), itens com modulo continuam visiveis', () => {
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    useTenantPlanMock.mockReturnValue({ plan: null, isLoading: true });

    render(<SidebarNav />);

    expect(screen.getByText('Viagens')).toBeInTheDocument();
    expect(screen.getByText('Pneus')).toBeInTheDocument();
  });
});
