import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  it('renderiza label e valor', () => {
    render(<StatCard label="Receita" value="R$ 1.000,00" />);
    expect(screen.getByText('Receita')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.000,00')).toBeInTheDocument();
  });

  it('variante default usa bg-surface e microinteração de hover (via Card interactive)', () => {
    const { container } = render(<StatCard label="Receita" value="R$ 1.000,00" />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/bg-surface\b/);
    expect(card.className).toMatch(/hover:shadow-sm/);
  });

  it('variante gradient não usa Card interactive (destaque não precisa de hover extra)', () => {
    const { container } = render(
      <StatCard label="Receita" value="R$ 1.000,00" variant="gradient" />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toMatch(/hover:shadow-sm/);
  });

  it('seta reflete a direção real do número, cor reflete se é favorável', () => {
    const { rerender } = render(
      <StatCard
        label="Despesas"
        value="R$ 1.200"
        trend={{ value: '+20.0% vs mês anterior', direction: 'up', favorable: false }}
      />,
    );
    let trendText = screen.getByText('+20.0% vs mês anterior');
    expect(trendText.parentElement?.className).toMatch(/text-danger-600/);

    rerender(
      <StatCard
        label="Receita"
        value="R$ 1.200"
        trend={{ value: '+20.0% vs mês anterior', direction: 'up', favorable: true }}
      />,
    );
    trendText = screen.getByText('+20.0% vs mês anterior');
    expect(trendText.parentElement?.className).toMatch(/text-success-600/);
  });

  it('variante gradient com trend usa classes de cor que realmente existem na paleta (text-success-500/text-danger-500, nunca -300)', () => {
    render(
      <StatCard
        label="Receita"
        value="R$ 1.000"
        variant="gradient"
        trend={{ value: '+10%', direction: 'up', favorable: true }}
      />,
    );
    const trendText = screen.getByText('+10%');
    expect(trendText.parentElement?.className).toMatch(/text-success-500/);
    expect(trendText.parentElement?.className).not.toMatch(/text-success-300|text-danger-300/);
  });
});
