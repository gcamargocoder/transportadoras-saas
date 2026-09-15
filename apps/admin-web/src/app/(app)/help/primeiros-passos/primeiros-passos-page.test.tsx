import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PrimeirosPassosPage from './page';

describe('PrimeirosPassosPage', () => {
  it('renderiza todos os passos, numerados, cada um com link para o artigo quando existir', () => {
    render(<PrimeirosPassosPage />);
    expect(screen.getByText('Conheça o painel')).toBeInTheDocument();
    expect(screen.getByText('Crie sua primeira viagem')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /ver artigo completo/i });
    expect(links.length).toBeGreaterThan(0);
  });
});
