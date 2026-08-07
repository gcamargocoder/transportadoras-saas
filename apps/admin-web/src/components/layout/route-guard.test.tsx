import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteGuard } from './route-guard';

const replaceMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

describe('RouteGuard', () => {
  afterEach(() => {
    replaceMock.mockClear();
    useAuthMock.mockClear();
  });

  it('exibe carregamento em tela cheia enquanto a sessão está sendo verificada', () => {
    useAuthMock.mockReturnValue({ status: 'loading', user: null });
    render(
      <RouteGuard>
        <div>Conteúdo protegido</div>
      </RouteGuard>,
    );
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });

  it('redireciona para /login quando não autenticado, sem renderizar o conteúdo', () => {
    useAuthMock.mockReturnValue({ status: 'unauthenticated', user: null });
    render(
      <RouteGuard>
        <div>Conteúdo protegido</div>
      </RouteGuard>,
    );
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith('/login');
  });

  it('renderiza o conteúdo protegido quando autenticado', () => {
    useAuthMock.mockReturnValue({ status: 'authenticated', user: { id: '1', name: 'Ana' } });
    render(
      <RouteGuard>
        <div>Conteúdo protegido</div>
      </RouteGuard>,
    );
    expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
