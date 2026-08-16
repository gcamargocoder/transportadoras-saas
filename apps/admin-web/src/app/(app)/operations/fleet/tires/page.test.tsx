import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FleetTiresOverviewEntity } from '../../../../../types/entities';
import FleetTiresOverviewPage from './page';

const getFleetOperationsTiresMock = vi.fn();

vi.mock('../../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsTires: (...args: unknown[]) => getFleetOperationsTiresMock(...args),
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
  return render(<FleetTiresOverviewPage />, { wrapper: Wrapper });
}

function buildOverview(overrides: Partial<FleetTiresOverviewEntity> = {}): FleetTiresOverviewEntity {
  return {
    totalTires: 20,
    newCount: 2,
    inUseCount: 12,
    stockCount: 5,
    retreadedCount: 1,
    scrappedCount: 0,
    investedValue: 45000,
    retreadValue: 3200,
    averageLifespanKm: 90000,
    nearReplacementCount: 3,
    byStatus: [
      { status: 'IN_USE', count: 12 },
      { status: 'STOCK', count: 5 },
    ],
    byFleet: [
      { fleetId: 'f1', fleetName: 'Frota SP', count: 8 },
      { fleetId: null, fleetName: 'Sem frota', count: 4 },
    ].map((r) => ({ ...r, cost: r.count * 500 })),
    monthlyTrendCost: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    tireWear: [
      {
        tireId: 't1',
        fireNumber: 'FG-0001',
        vehiclePlate: 'ABC1D23',
        position: 'Dianteiro Esquerdo',
        wearPercentRemaining: 25,
        currentTreadDepthMm: 5,
        initialTreadDepthMm: 20,
        available: true,
        reason: null,
      },
    ],
    topVehiclesByTireCost: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 4000, count: 4000 }],
    tireAlerts: [],
    ...overrides,
  };
}

describe('FleetTiresOverviewPage', () => {
  beforeEach(() => {
    getFleetOperationsTiresMock.mockReset();
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getFleetOperationsTiresMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getFleetOperationsTiresMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza os cards com dado real', async () => {
    getFleetOperationsTiresMock.mockResolvedValue(buildOverview());
    renderPage();

    expect(await screen.findByText('20')).toBeInTheDocument(); // total
    expect(screen.getByText('R$ 45.000,00')).toBeInTheDocument(); // valor investido
    expect(screen.getByText('R$ 3.200,00')).toBeInTheDocument(); // valor de recapagem
    expect(screen.getByText('90.000 km')).toBeInTheDocument(); // vida util media
  });

  it('mostra "Indisponível" quando a vida útil média não está disponível', async () => {
    getFleetOperationsTiresMock.mockResolvedValue(buildOverview({ averageLifespanKm: null }));
    renderPage();

    expect(await screen.findByText('Vida útil média planejada')).toBeInTheDocument();
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
  });

  it('renderiza o gauge de desgaste do pneu disponível', async () => {
    getFleetOperationsTiresMock.mockResolvedValue(buildOverview());
    renderPage();

    expect(await screen.findByText('Desgaste dos pneus')).toBeInTheDocument();
    expect(screen.getByText('FG-0001')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('mostra card indisponível de desgaste com o motivo', async () => {
    getFleetOperationsTiresMock.mockResolvedValue(
      buildOverview({
        tireWear: [
          {
            tireId: 't2',
            fireNumber: 'FG-0002',
            vehiclePlate: 'XYZ9A88',
            position: null,
            wearPercentRemaining: null,
            currentTreadDepthMm: null,
            initialTreadDepthMm: null,
            available: false,
            reason: 'INITIAL_TREAD_DEPTH_NOT_CONFIGURED',
          },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('FG-0002')).toBeInTheDocument();
    expect(screen.getByText('Sulco inicial não cadastrado')).toBeInTheDocument();
  });

  it('renderiza os breakdowns por status e por frota, incluindo "Sem frota"', async () => {
    getFleetOperationsTiresMock.mockResolvedValue(buildOverview());
    renderPage();

    expect(await screen.findByText('Por frota')).toBeInTheDocument();
    expect(screen.getAllByText('Frota SP').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sem frota').length).toBeGreaterThan(0);
  });

  it('renderiza o ranking de veiculos por custo de pneu com link para o veiculo', async () => {
    getFleetOperationsTiresMock.mockResolvedValue(buildOverview());
    renderPage();

    expect(await screen.findByText('Veículos com maior custo de pneus')).toBeInTheDocument();
    const link = screen.getAllByRole('link', { name: 'ABC1D23' })[0];
    expect(link).toHaveAttribute('href', '/vehicles/v1');
  });

  it('mostra mensagem vazia quando não há alerta de troca', async () => {
    getFleetOperationsTiresMock.mockResolvedValue(buildOverview({ tireAlerts: [] }));
    renderPage();

    expect(await screen.findByText('Nenhum pneu próximo da troca no período/filtro selecionado.')).toBeInTheDocument();
  });

  it('lista alertas de proximidade de troca com placa, mensagem e severidade traduzida', async () => {
    getFleetOperationsTiresMock.mockResolvedValue(
      buildOverview({
        tireAlerts: [
          { type: 'TIRE_NEAR_REPLACEMENT', severity: 'ATTENTION', vehicleId: 'v1', plate: 'ABC1D23', message: 'Pneu FG-0001 com 2.0mm de sulco.', value: 2 },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('Pneu FG-0001 com 2.0mm de sulco.')).toBeInTheDocument();
    expect(screen.getByText('Atenção')).toBeInTheDocument();
  });

  it('filtra por status do pneu', async () => {
    getFleetOperationsTiresMock.mockResolvedValue(buildOverview());
    renderPage();
    await screen.findByText('20');

    fireEvent.change(screen.getByLabelText('Status do pneu'), { target: { value: 'STOCK' } });

    await waitFor(() =>
      expect(getFleetOperationsTiresMock).toHaveBeenLastCalledWith(expect.objectContaining({ tireStatus: 'STOCK' }), expect.anything()),
    );
  });

  it('link "Ver todos os pneus" aponta para /tires', async () => {
    getFleetOperationsTiresMock.mockResolvedValue(buildOverview());
    renderPage();

    const link = await screen.findByRole('link', { name: 'Ver todos os pneus →' });
    expect(link).toHaveAttribute('href', '/tires');
  });
});
