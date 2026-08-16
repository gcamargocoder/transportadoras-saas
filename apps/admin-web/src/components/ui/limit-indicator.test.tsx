import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LimitIndicator } from './limit-indicator';

describe('LimitIndicator', () => {
  it('nao renderiza nada quando o plano nao tem limite configurado (max null)', () => {
    const { container } = render(<LimitIndicator label="Veículos" current={5} max={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra "atual / limite" quando abaixo do limite', () => {
    render(<LimitIndicator label="Veículos" current={18} max={20} />);
    expect(screen.getByText(/Veículos 18 \/ 20 utilizados/)).toBeInTheDocument();
    expect(screen.queryByText(/Limite do plano atingido/)).not.toBeInTheDocument();
  });

  it('mostra aviso de limite atingido quando current >= max', () => {
    render(<LimitIndicator label="Veículos" current={20} max={20} />);
    expect(screen.getByText(/20 \/ 20 utilizados/)).toBeInTheDocument();
    expect(screen.getByText(/Limite do plano atingido/)).toBeInTheDocument();
  });
});
