import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HelpHomePage from './page';

// Parte 24 do pedido -- Central: renderização, busca, resultado, ausência
// de resultado, links internos.
describe('HelpHomePage', () => {
  it('sem busca, mostra a chamada de Primeiros passos e as categorias', () => {
    render(<HelpHomePage />);
    expect(screen.getByText('Primeiros passos')).toBeInTheDocument();
    expect(screen.getByText('Operação')).toBeInTheDocument();
    expect(screen.getByText('Financeiro')).toBeInTheDocument();
  });

  it('buscar por um termo real mostra resultados com link para o artigo', () => {
    render(<HelpHomePage />);
    fireEvent.change(screen.getByPlaceholderText(/busque por um termo/i), { target: { value: 'pedágio' } });

    expect(screen.getByText(/resultados para "pedágio"/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /como funciona a conferência de pedágio/i });
    expect(link).toHaveAttribute('href', '/help/pedagios');
  });

  it('buscar por um termo sem correspondência mostra a mensagem de "não encontramos"', () => {
    render(<HelpHomePage />);
    fireEvent.change(screen.getByPlaceholderText(/busque por um termo/i), {
      target: { value: 'xyzabc-termo-sem-correspondencia' },
    });

    expect(screen.getByText('Não encontramos uma orientação para essa dúvida.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver primeiros passos/i })).toHaveAttribute('href', '/help/primeiros-passos');
  });

  it('o botão "Rever introdução" abre o onboarding', () => {
    render(<HelpHomePage />);
    expect(screen.queryByText('Bem-vindo ao sistema')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rever introdução' }));
    expect(screen.getByText('Bem-vindo ao sistema')).toBeInTheDocument();
  });
});
