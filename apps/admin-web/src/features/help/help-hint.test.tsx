import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpHint } from './help-hint';

describe('HelpHint', () => {
  it('não renderiza nada se o artigo referenciado não existir (nunca um link de ajuda quebrado)', () => {
    const { container } = render(<HelpHint articleSlug="slug-que-nao-existe" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza um botão de ajuda acessível para um artigo existente', () => {
    render(<HelpHint articleSlug="ciclo-de-vida-da-viagem" />);
    expect(screen.getByRole('button', { name: /entenda/i })).toBeInTheDocument();
  });

  it('o resumo do artigo só aparece depois do clique', () => {
    render(<HelpHint articleSlug="ciclo-de-vida-da-viagem" />);
    expect(screen.queryByText(/quais status ela passa/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /entenda/i }));
    expect(screen.getByText(/quais status ela passa/i)).toBeInTheDocument();
  });

  it('tem um link para o artigo completo dentro do popover', () => {
    render(<HelpHint articleSlug="ciclo-de-vida-da-viagem" />);
    fireEvent.click(screen.getByRole('button', { name: /entenda/i }));

    const link = screen.getByRole('link', { name: /ver artigo completo/i });
    expect(link).toHaveAttribute('href', '/help/ciclo-de-vida-da-viagem');
  });

  it('clicar fora fecha o popover', () => {
    render(
      <div>
        <HelpHint articleSlug="ciclo-de-vida-da-viagem" />
        <button type="button">fora</button>
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /entenda/i }));
    expect(screen.getByRole('link', { name: /ver artigo completo/i })).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'fora' }));
    expect(screen.queryByRole('link', { name: /ver artigo completo/i })).not.toBeInTheDocument();
  });
});
