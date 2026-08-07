import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';

const replaceMock = vi.fn();
const loginMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('../../hooks/use-auth', () => ({
  useAuth: () => ({ status: 'unauthenticated', login: loginMock }),
}));

describe('LoginPage', () => {
  afterEach(() => {
    replaceMock.mockClear();
    loginMock.mockClear();
  });

  it('exibe mensagens de validação em português ao enviar o formulário vazio', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText(/identificador de empresa/i)).toBeInTheDocument();
    expect(screen.getByText(/informe um e-mail válido/i)).toBeInTheDocument();
    expect(screen.getByText(/senha deve ter no mínimo 8 caracteres/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('chama login() com os dados informados e redireciona ao dashboard', async () => {
    loginMock.mockResolvedValue(undefined);
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/identificador da empresa/i), {
      target: { value: '123e4567-e89b-12d3-a456-426614174000' },
    });
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'usuario@empresa.com.br' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'SenhaForte123!' } });

    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        tenantId: '123e4567-e89b-12d3-a456-426614174000',
        email: 'usuario@empresa.com.br',
        password: 'SenhaForte123!',
      }),
    );
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('exibe mensagem amigável quando o login falha', async () => {
    loginMock.mockRejectedValue(new Error('E-mail ou senha inválidos.'));
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/identificador da empresa/i), {
      target: { value: '123e4567-e89b-12d3-a456-426614174000' },
    });
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: 'usuario@empresa.com.br' },
    });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'SenhaForte123!' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
  });
});
