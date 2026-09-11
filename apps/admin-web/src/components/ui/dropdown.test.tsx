import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dropdown } from './dropdown';

describe('Dropdown', () => {
  it('abre o menu ao clicar no trigger e mostra os itens', () => {
    render(
      <Dropdown trigger={<span>abrir</span>} items={[{ label: 'Item 1', onClick: vi.fn() }]} />,
    );

    fireEvent.click(screen.getByText('abrir'));

    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  it('o painel usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    render(
      <Dropdown trigger={<span>abrir</span>} items={[{ label: 'Item 1', onClick: vi.fn() }]} />,
    );
    fireEvent.click(screen.getByText('abrir'));

    const panel = screen.getByRole('menu');
    expect(panel.className).toMatch(/bg-surface\b/);
    expect(panel.className).not.toMatch(/bg-white/);
  });

  it('chama onClick do item e fecha o menu', () => {
    const onClick = vi.fn();
    render(<Dropdown trigger={<span>abrir</span>} items={[{ label: 'Item 1', onClick }]} />);
    fireEvent.click(screen.getByText('abrir'));

    fireEvent.click(screen.getByText('Item 1'));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
  });
});
