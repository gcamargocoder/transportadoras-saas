import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HelpArticlePage from './page';

const notFoundMock = vi.fn();
vi.mock('next/navigation', () => ({ notFound: () => notFoundMock() }));

describe('HelpArticlePage', () => {
  it('renderiza o artigo quando o slug existe', () => {
    render(<HelpArticlePage params={{ slug: 'ciclo-de-vida-da-viagem' }} />);
    expect(screen.getByText('Como funciona uma viagem')).toBeInTheDocument();
    expect(screen.getByText('O que é?')).toBeInTheDocument();
    expect(screen.getByText('Atenção')).toBeInTheDocument();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('chama notFound() quando o slug não existe (nunca inventa conteúdo)', () => {
    render(<HelpArticlePage params={{ slug: 'slug-que-nao-existe' }} />);
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('mostra os links de "Veja também" quando o artigo tem relatedSlugs', () => {
    render(<HelpArticlePage params={{ slug: 'ciclo-de-vida-da-viagem' }} />);
    expect(screen.getByText('Veja também')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Como criar uma viagem' })).toHaveAttribute('href', '/help/criar-uma-viagem');
  });
});
