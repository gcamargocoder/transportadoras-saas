import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './card';

describe('Card', () => {
  it('usa bg-surface (reage ao dark mode), nunca bg-white fixo', () => {
    render(<Card data-testid="card">conteúdo</Card>);
    const card = screen.getByTestId('card');
    expect(card.className).toMatch(/bg-surface\b/);
    expect(card.className).not.toMatch(/bg-white/);
  });

  it('não aplica microinteração de hover quando interactive não é informado', () => {
    render(<Card data-testid="card">conteúdo</Card>);
    expect(screen.getByTestId('card').className).not.toMatch(/hover:shadow-sm/);
  });

  it('aplica hover:shadow-sm quando interactive=true', () => {
    render(
      <Card data-testid="card" interactive>
        conteúdo
      </Card>,
    );
    expect(screen.getByTestId('card').className).toMatch(/hover:shadow-sm/);
  });
});
