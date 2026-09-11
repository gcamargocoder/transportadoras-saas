import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartTooltip } from './chart-tooltip';

describe('ChartTooltip', () => {
  it('não renderiza nada quando inativo', () => {
    const { container } = render(
      <ChartTooltip active={false} payload={[]} label="Jan/26" valueFormatter={(v) => String(v)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('não renderiza nada quando não há payload', () => {
    const { container } = render(
      <ChartTooltip active payload={[]} label="Jan/26" valueFormatter={(v) => String(v)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o rótulo (mês) e o valor formatado quando ativo', () => {
    render(
      <ChartTooltip
        active
        payload={[{ value: 1234.5, name: 'value', dataKey: 'value', color: '#4f46e5' }]}
        label="Mar/26"
        valueFormatter={(v) => `R$ ${v.toFixed(2)}`}
      />,
    );
    expect(screen.getByText('Mar/26')).toBeInTheDocument();
    expect(screen.getByText('R$ 1234.50')).toBeInTheDocument();
  });
});
