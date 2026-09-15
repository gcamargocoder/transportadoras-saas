import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../lib/auth/auth-context';
import { OnboardingLauncher } from './onboarding-launcher';

function renderWithUser(user: AuthContextValue['user']) {
  const value: AuthContextValue = {
    status: user ? 'authenticated' : 'unauthenticated',
    user,
    login: async () => undefined,
    logout: async () => undefined,
  };
  return render(
    <AuthContext.Provider value={value}>
      <OnboardingLauncher />
    </AuthContext.Provider>,
  );
}

describe('OnboardingLauncher', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sem usuário autenticado, não mostra nada', () => {
    const { container } = renderWithUser(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('primeiro acesso de um usuário: mostra o onboarding automaticamente', () => {
    renderWithUser({ id: 'user-1', tenantId: 'tenant-1', name: 'Ana', email: 'a@a.com', role: 'ADMIN' });
    expect(screen.getByText('Bem-vindo ao sistema')).toBeInTheDocument();
  });

  it('usuário que já dispensou o onboarding antes: não mostra de novo', () => {
    localStorage.setItem('help.onboarding.dismissed.tenant-1.user-1', '1');
    renderWithUser({ id: 'user-1', tenantId: 'tenant-1', name: 'Ana', email: 'a@a.com', role: 'ADMIN' });
    expect(screen.queryByText('Bem-vindo ao sistema')).not.toBeInTheDocument();
  });
});
