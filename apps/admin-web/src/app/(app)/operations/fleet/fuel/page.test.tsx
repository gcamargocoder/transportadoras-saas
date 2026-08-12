import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetFuelAnalyticsEntity } from '../../../../../types/entities';
import FleetFuelPage from './page';

const getFleetOperationsFuelMock = vi.fn();

vi.mock('../../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsFuel: (...args: unknown[]) => getFleetOperationsFuelMock(...args),
}));

vi.mock('../../../../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [] }),
  listFleets: () => Promise.resolve({ items: [] }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<FleetFuelPage />, { wrapper: Wrapper });
}

function buildFuelAnalytics(overrides: Partial<FleetFuelAnalyticsEntity> = {}): FleetFuelAnalyticsEntity {
  return {
    summary: {
      totalCost: 8000,
      totalLiters: 3000,
      supplyCount: 20,
      averagePricePerLiter: 2.67,
      averageCostPerSupply: 400,
      vehiclesSupplied: 5,
      fleetsSupplied: 2,
    },
    consumption: { value: 2.8, available: true, unit: 'km/l', reason: null },
    costPerKm: { value: 1.2, available: true, reason: null },
    monthlyTrendCost: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    monthlyTrendLiters: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    monthlyTrendSupplyCount: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    vehicleBreakdown: [],
    fleetBreakdown: [],
    rankings: {
      topCost: [],
      bottomCost: [],
      topVolume: [],
      bottomVolume: [],
      bestConsumption: [],
      worstConsumption: [],
      topPricePerLiter: [],
      topSupplyCount: [],
    },
    alerts: [],
    previousPeriod: null,
    ...overrides,
  };
}

describe('FleetFuelPage', () => {
  beforeEach(() => {
    getFleetOperationsFuelMock.mockReset();
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getFleetOperationsFuelMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getFleetOperationsFuelMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza o resumo com dado real', async () => {
    getFleetOperationsFuelMock.mockResolvedValue(buildFuelAnalytics());
    renderPage();

    expect(await screen.findByText('R$ 8.000,00')).toBeInTheDocument(); // custo total
    expect(screen.getByText('3.000 L')).toBeInTheDocument(); // litros (formatNumber nunca mostra ",0" a mais)
    expect(screen.getByText('2,8 km/L')).toBeInTheDocument(); // consumo medio da frota
    expect(screen.getByText('R$ 1,20')).toBeInTheDocument(); // custo de combustivel/km
  });

  it('mostra "Indisponível" (nunca R$ 0,00/NaN) quando consumo/custo por km nao estao disponiveis', async () => {
    getFleetOperationsFuelMock.mockResolvedValue(
      buildFuelAnalytics({
        consumption: { value: null, available: false, unit: 'km/l', reason: 'INSUFFICIENT_ODOMETER_READINGS' },
        costPerKm: { value: null, available: false, reason: 'INSUFFICIENT_ODOMETER_READINGS' },
      }),
    );
    renderPage();

    expect(await screen.findByText('Consumo médio da frota')).toBeInTheDocument();
    expect(screen.getAllByText('Indisponível').length).toBeGreaterThanOrEqual(2);
  });

  it('renderiza o breakdown por veiculo, incluindo indicador de anomalia de hodometro', async () => {
    getFleetOperationsFuelMock.mockResolvedValue(
      buildFuelAnalytics({
        vehicleBreakdown: [
          {
            vehicleId: 'v1',
            plate: 'ABC1D23',
            fleetId: 'f1',
            fleetName: 'Frota SP',
            supplyCount: 3,
            liters: 150,
            cost: 750,
            averagePricePerLiter: 5,
            consumption: { value: 8.5, available: true, unit: 'km/l', reason: null },
            costPerKm: { value: 0.59, available: true, reason: null },
            rankPosition: 1,
            hasOdometerAnomaly: true,
          },
        ],
      }),
    );
    renderPage();

    // DataTable renderiza tabela (desktop) + cards (mobile) simultaneamente
    // no DOM (uma versao fica so visualmente escondida via CSS) -- por isso
    // getAllByText, nao getByText, para conteudo vindo de DataTable.
    expect(await screen.findAllByText('ABC1D23')).not.toHaveLength(0);
    expect(screen.getAllByText('Frota SP').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Regressão detectada').length).toBeGreaterThan(0);
  });

  it('renderiza o breakdown por frota, incluindo o balde "Sem frota"', async () => {
    getFleetOperationsFuelMock.mockResolvedValue(
      buildFuelAnalytics({
        fleetBreakdown: [
          {
            fleetId: null,
            fleetName: 'Sem frota',
            supplyCount: 2,
            liters: 80,
            cost: 400,
            averagePricePerLiter: 5,
            consumption: { value: null, available: false, unit: 'km/l', reason: 'INSUFFICIENT_ODOMETER_READINGS' },
          },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('Por frota')).toBeInTheDocument();
    expect(screen.getAllByText('Sem frota').length).toBeGreaterThan(0);
  });

  it('mostra mensagem vazia no ranking de consumo quando nenhum veiculo tem dado suficiente', async () => {
    getFleetOperationsFuelMock.mockResolvedValue(buildFuelAnalytics({ rankings: { ...buildFuelAnalytics().rankings, bestConsumption: [] } }));
    renderPage();

    expect(
      await screen.findAllByText('Nenhum veículo com consumo disponível (mínimo 2 abastecimentos com hodômetro).'),
    ).toHaveLength(2); // bestConsumption + worstConsumption
  });

  it('renderiza rankings de custo/volume/preco/quantidade com dado real', async () => {
    getFleetOperationsFuelMock.mockResolvedValue(
      buildFuelAnalytics({
        rankings: {
          topCost: [{ vehicleId: 'v1', plate: 'XYZ9A88', value: 3000, count: 5 }],
          bottomCost: [],
          topVolume: [],
          bottomVolume: [],
          bestConsumption: [],
          worstConsumption: [],
          topPricePerLiter: [],
          topSupplyCount: [{ vehicleId: 'v1', plate: 'XYZ9A88', value: 5, count: 5 }],
        },
      }),
    );
    renderPage();

    expect(await screen.findByText('Maior custo total')).toBeInTheDocument();
    expect(screen.getAllByText(/XYZ9A88/).length).toBeGreaterThan(0);
  });

  it('mostra mensagem vazia quando não há alertas', async () => {
    getFleetOperationsFuelMock.mockResolvedValue(buildFuelAnalytics({ alerts: [] }));
    renderPage();

    expect(await screen.findByText('Nenhum alerta no período/filtro selecionado.')).toBeInTheDocument();
  });

  it('lista alertas com placa, mensagem e severidade traduzida', async () => {
    getFleetOperationsFuelMock.mockResolvedValue(
      buildFuelAnalytics({
        alerts: [
          {
            type: 'ODOMETER_REGRESSION',
            severity: 'CRITICAL',
            vehicleId: 'v1',
            plate: 'ABC1D23',
            message: 'Hodometro regressivo detectado.',
            value: null,
          },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('ABC1D23')).toBeInTheDocument();
    expect(screen.getByText('Hodometro regressivo detectado.')).toBeInTheDocument();
    expect(screen.getByText('Crítico')).toBeInTheDocument();
  });

  it('mostra a variação percentual de custo vs período anterior quando presente', async () => {
    getFleetOperationsFuelMock.mockResolvedValue(
      buildFuelAnalytics({
        previousPeriod: {
          currentCost: 200,
          previousCost: 100,
          costDeltaPercent: 100,
          currentLiters: 40,
          previousLiters: 20,
          litersDeltaPercent: 100,
          currentSupplyCount: 1,
          previousSupplyCount: 1,
          supplyCountDeltaPercent: 0,
        },
      }),
    );
    renderPage();

    expect(await screen.findByText('Custo vs período anterior')).toBeInTheDocument();
    expect(screen.getByText('+100%')).toBeInTheDocument();
  });
});
