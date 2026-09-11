import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renderiza o texto do botão', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('variante outline usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    render(<Button variant="outline">Cancelar</Button>);
    const button = screen.getByRole('button', { name: 'Cancelar' });
    expect(button.className).toMatch(/bg-surface\b/);
    expect(button.className).not.toMatch(/bg-white/);
  });

  it('fica desabilitado enquanto loading', () => {
    render(<Button loading>Salvando</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
