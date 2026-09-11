import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../lib/theme/theme-context';
import { MonthlyChartCard } from './monthly-chart-card';

describe('MonthlyChartCard', () => {
  it('renderiza o título do card', () => {
    render(
      <ThemeProvider>
        <MonthlyChartCard
          title="Receita mensal"
          data={[
            { month: 'Jan/26', value: 1000 },
            { month: 'Fev/26', value: 1200 },
          ]}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Receita mensal')).toBeInTheDocument();
  });

  it('renderiza a descrição quando informada', () => {
    render(
      <ThemeProvider>
        <MonthlyChartCard
          title="Receita mensal"
          description="Últimos 12 meses"
          data={[{ month: 'Jan/26', value: 1000 }]}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Últimos 12 meses')).toBeInTheDocument();
  });
});
