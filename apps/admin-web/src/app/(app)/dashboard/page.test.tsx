import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DashboardPage from './page';
import { getDashboard } from '../../../lib/api/dashboard.api';

vi.mock('../../../lib/api/dashboard.api', () => ({
  getDashboard: vi.fn(),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return actual;
});

function buildDashboardData() {
  return {
    overview: {
      totalTrips: 120,
      activeTrips: 8,
      finishedTrips: 100,
      cancelledTrips: 12,
      totalDrivers: 20,
      activeDrivers: 15,
      totalVehicles: 30,
      availableVehicles: 22,
      maintenanceVehicles: 3,
      fuelStations: 5,
      customers: 40,
    },
    financial: {
      totalRevenue: 500000,
      approvedExpenses: 120000,
      advances: 8000,
      profit: 380000,
      netResult: 372000,
      averageTripRevenue: 4166.67,
      averageTripExpense: 1000,
      largestRevenue: 20000,
      largestExpense: 5000,
      margin: 76,
    },
    operational: {
      todayTrips: 4,
      lateTrips: 1,
      tripsInProgress: 8,
      completedToday: 3,
      kmDriven: 45000,
      averageTripDistance: 375,
    },
    fleet: {
      fuelConsumed: 12000,
      fuelCost: 60000,
      averageConsumptionKmL: 3.2,
      costPerKm: 4.5,
      maintenanceCost: 15000,
      maintenanceOpen: 2,
      maintenanceClosed: 10,
    },
    charts: {
      // Percentuais deliberadamente distintos entre si (25/15/10/5%) --
      // evita que getByText() ambíguo quebre o teste por 2 StatCards
      // mostrarem o mesmo texto de tendência.
      monthlyRevenue: [
        { month: 'Jan/26', value: 400000 },
        { month: 'Fev/26', value: 500000 },
      ],
      monthlyExpenses: [
        { month: 'Jan/26', value: 100000 },
        { month: 'Fev/26', value: 115000 },
      ],
      monthlyFuelCost: [
        { month: 'Jan/26', value: 50000 },
        { month: 'Fev/26', value: 55000 },
      ],
      monthlyTrips: [
        { month: 'Jan/26', value: 100 },
        { month: 'Fev/26', value: 105 },
      ],
    },
  };
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../../../lib/theme/theme-context';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('DashboardPage', () => {
  it('mostra tendência real (derivada da série mensal) nas 4 KPIs com histórico', async () => {
    vi.mocked(getDashboard).mockResolvedValue(buildDashboardData());
    renderPage();

    expect(await screen.findByText('+25.0% vs mês anterior')).toBeInTheDocument(); // Receita: 400k -> 500k
    expect(screen.getByText('+15.0% vs mês anterior')).toBeInTheDocument(); // Despesas: 100k -> 115k
    expect(screen.getByText('+10.0% vs mês anterior')).toBeInTheDocument(); // Combustível: 50k -> 55k
    expect(screen.getByText('+5.0% vs mês anterior')).toBeInTheDocument(); // Viagens: 100 -> 105
  });

  it('Resultado líquido não mostra tendência (sem série mensal correspondente)', async () => {
    vi.mocked(getDashboard).mockResolvedValue(buildDashboardData());
    renderPage();

    await screen.findByText('Resultado líquido');
    const label = screen.getByText('Resultado líquido');
    const card = label.closest('div')?.parentElement as HTMLElement;
    expect(card.textContent).not.toMatch(/vs mês anterior/);
  });
});
