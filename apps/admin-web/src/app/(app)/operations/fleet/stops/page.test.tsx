import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../../../components/ui/toast';
import type { FleetStopsDashboardEntity } from '../../../../../types/entities';
import FleetStopsPage from './page';

const getFleetOperationsStopsMock = vi.fn();
const listTripStopsMock = vi.fn();
const useAuthMock = vi.fn();
const getTenantSettingsMock = vi.fn();
const updateTenantSettingsMock = vi.fn();

vi.mock('../../../../../lib/api/fleet-operations.api', () => ({
  getFleetOperationsStops: (...args: unknown[]) => getFleetOperationsStopsMock(...args),
}));

vi.mock('../../../../../lib/api/trip-stops.api', () => ({
  listTripStops: (...args: unknown[]) => listTripStopsMock(...args),
}));

vi.mock('../../../../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [] }),
  listFleets: () => Promise.resolve({ items: [] }),
}));

vi.mock('../../../../../lib/api/drivers.api', () => ({
  listDrivers: () => Promise.resolve({ items: [] }),
}));

vi.mock('../../../../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../../../../lib/api/admin.api', async () => {
  const actual = await vi.importActual<typeof import('../../../../../lib/api/admin.api')>(
    '../../../../../lib/api/admin.api',
  );
  return {
    ...actual,
    getTenantSettings: (...args: unknown[]) => getTenantSettingsMock(...args),
    updateTenantSettings: (...args: unknown[]) => updateTenantSettingsMock(...args),
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<FleetStopsPage />, { wrapper: Wrapper });
}

function buildStops(overrides: Partial<FleetStopsDashboardEntity> = {}): FleetStopsDashboardEntity {
  return {
    totalStops: 2,
    totalDurationMinutes: 60,
    averageDurationMinutes: 30,
    maxDurationMinutes: 40,
    minDurationMinutes: 20,
    byType: [
      { type: 'FUEL', count: 1, totalDurationMinutes: 20 },
      { type: 'MEAL', count: 1, totalDurationMinutes: 40 },
    ],
    topVehiclesByDuration: [{ vehicleId: 'v1', plate: 'ABC1D23', value: 60, count: 2 }],
    driverRanking: [],
    durationAlerts: [],
    monthlyTrend: Array.from({ length: 12 }, (_, i) => ({ month: `M${i}`, value: 0 })),
    ...overrides,
  };
}

describe('FleetStopsPage', () => {
  beforeEach(() => {
    getFleetOperationsStopsMock.mockReset();
    listTripStopsMock.mockReset();
    listTripStopsMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } });
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'OPERATOR' } });
    getTenantSettingsMock.mockReset();
    getTenantSettingsMock.mockResolvedValue({
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      language: 'pt-BR',
      gpsPingIntervalSeconds: 30,
      maxDeviationMeters: 500,
      alertDelayThresholdMin: 15,
      preferences: {},
    });
    updateTenantSettingsMock.mockReset();
  });

  it('mostra estado de carregamento (skeleton) antes da resposta chegar', async () => {
    getFleetOperationsStopsMock.mockReturnValue(new Promise(() => undefined));
    const { container } = renderPage();

    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull());
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getFleetOperationsStopsMock.mockRejectedValue(new Error('falhou'));
    renderPage();

    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('renderiza os cards e o breakdown por tipo de parada traduzido em pt-BR', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(buildStops());
    renderPage();

    expect(await screen.findByText('2')).toBeInTheDocument(); // total de paradas (StatCard)
    // DataTable renderiza tabela (desktop) + cartoes (mobile) simultaneamente
    // no DOM (visibilidade so por CSS) -- por isso getAllByText, nao getByText
    // (mesmo padrao ja usado em operations/page.test.tsx).
    expect(screen.getAllByText('Abastecimento').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Refeição').length).toBeGreaterThan(0);
  });

  it('mostra "—" (nunca "0 min") quando averageDurationMinutes/max/min chegam null', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(
      buildStops({ averageDurationMinutes: null, maxDurationMinutes: null, minDurationMinutes: null }),
    );
    renderPage();

    expect(await screen.findByText('Tempo médio de parada')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('exibe maior e menor parada quando disponiveis', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(buildStops({ maxDurationMinutes: 90, minDurationMinutes: 5 }));
    renderPage();

    expect(await screen.findByText('Maior parada')).toBeInTheDocument();
    expect(screen.getByText('90 min')).toBeInTheDocument();
    expect(screen.getByText('Menor parada')).toBeInTheDocument();
    expect(screen.getByText('5 min')).toBeInTheDocument();
  });

  it('mostra mensagem vazia no ranking quando não há paradas', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(
      buildStops({ topVehiclesByDuration: [], totalStops: 0, totalDurationMinutes: 0, averageDurationMinutes: null }),
    );
    renderPage();

    expect(
      await screen.findByText('Nenhum veículo com parada registrada no período/filtro selecionado.'),
    ).toBeInTheDocument();
  });

  it('carrega e exibe a tabela de paradas individuais retornada por listTripStops', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(buildStops());
    listTripStopsMock.mockResolvedValue({
      items: [
        {
          id: 'stop-1',
          tripId: 'trip-1',
          vehicleId: 'v1',
          driverId: 'd1',
          type: 'YARD',
          status: 'COMPLETED',
          source: 'ADMIN',
          latitude: null,
          longitude: null,
          startedAt: '2026-09-01T08:00:00.000Z',
          endedAt: '2026-09-01T08:30:00.000Z',
          durationMinutes: 30,
          locationLabel: null,
          notes: null,
          cancelledAt: null,
          syncStatus: 'SYNCED',
          deviceEventId: 'dev-1',
          createdAt: '2026-09-01T08:30:00.000Z',
          updatedAt: '2026-09-01T08:30:00.000Z',
          vehiclePlate: 'ABC1D23',
          driverName: 'José da Silva',
          tripReference: 'Origem -> Destino',
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    renderPage();

    expect((await screen.findAllByText('ABC1D23')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('José da Silva').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Origem -> Destino').length).toBeGreaterThan(0);
  });

  it('abre o detalhe da parada ao clicar na linha da tabela', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(buildStops());
    listTripStopsMock.mockResolvedValue({
      items: [
        {
          id: 'stop-1',
          tripId: null,
          vehicleId: 'v1',
          driverId: null,
          type: 'GARAGE',
          status: 'OPEN',
          source: 'ADMIN',
          latitude: null,
          longitude: null,
          startedAt: '2026-09-01T08:00:00.000Z',
          endedAt: null,
          durationMinutes: null,
          locationLabel: null,
          notes: 'Observação de teste',
          cancelledAt: null,
          syncStatus: 'SYNCED',
          deviceEventId: 'dev-2',
          createdAt: '2026-09-01T08:00:00.000Z',
          updatedAt: '2026-09-01T08:00:00.000Z',
          vehiclePlate: 'XYZ9A87',
          driverName: null,
          tripReference: null,
        },
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    renderPage();

    const rows = await screen.findAllByText('XYZ9A87');
    fireEvent.click(rows[0]!);

    expect(await screen.findByText('Detalhe da parada')).toBeInTheDocument();
    expect(screen.getByText('Observação de teste')).toBeInTheDocument();
    expect(screen.getByText('dev-2')).toBeInTheDocument();
  });

  // Fase 44 -- ranking de motoristas + alertas de duracao longa.
  it('exibe o ranking de motoristas quando ha dado', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(
      buildStops({
        driverRanking: [
          {
            driverId: 'd1',
            driverName: 'José da Silva',
            stopsCount: 3,
            totalDurationMinutes: 90,
            averageDurationMinutes: 30,
            maxDurationMinutes: 50,
            minDurationMinutes: 10,
            rankPosition: 1,
          },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('🏆 Ranking de motoristas por tempo parado')).toBeInTheDocument();
    expect(screen.getAllByText('José da Silva').length).toBeGreaterThan(0);
    expect(screen.getAllByText('#1').length).toBeGreaterThan(0);
  });

  it('mostra mensagem vazia no ranking quando nenhum motorista tem parada no período/filtro', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(buildStops({ driverRanking: [] }));
    renderPage();

    expect(
      await screen.findByText('Nenhum motorista com parada registrada no período/filtro selecionado.'),
    ).toBeInTheDocument();
  });

  it('exibe os alertas de duração longa com a contagem no cabeçalho', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(
      buildStops({
        durationAlerts: [
          {
            stopId: 'stop-9',
            type: 'FUEL',
            durationMinutes: 75,
            thresholdMinutes: 30,
            excessMinutes: 45,
            vehicleId: 'v1',
            vehiclePlate: 'ABC1D23',
            driverId: 'd1',
            driverName: 'José da Silva',
            tripId: 't1',
            tripReference: 'Origem -> Destino',
            startedAt: '2026-09-01T08:00:00.000Z',
            endedAt: '2026-09-01T09:15:00.000Z',
            status: 'COMPLETED',
          },
        ],
      }),
    );
    renderPage();

    expect(await screen.findByText('⚠️ Alertas de paradas')).toBeInTheDocument();
    expect(screen.getByText('1 alerta(s)')).toBeInTheDocument();
    expect(screen.getAllByText('+45 min').length).toBeGreaterThan(0);
  });

  it('sem alertas: nenhum badge de contagem e mensagem vazia', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(buildStops({ durationAlerts: [] }));
    renderPage();

    await screen.findByText('⚠️ Alertas de paradas');
    expect(screen.queryByText(/alerta\(s\)/)).toBeNull();
    expect(
      await screen.findByText('Nenhuma parada excedeu o limite configurado no período/filtro selecionado.'),
    ).toBeInTheDocument();
  });

  it('editor de limites: visível para ADMIN, oculto para OPERATOR', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(buildStops());
    useAuthMock.mockReturnValue({ user: { role: 'OPERATOR' } });
    renderPage();
    await screen.findByText('⚠️ Alertas de paradas');
    expect(screen.queryByText('Limites de duração de parada (por tipo)')).toBeNull();
  });

  it('editor de limites: ADMIN consegue ver e salvar', async () => {
    getFleetOperationsStopsMock.mockResolvedValue(buildStops());
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    updateTenantSettingsMock.mockResolvedValue({});
    renderPage();

    expect(await screen.findByText('Limites de duração de parada (por tipo)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Limite (minutos) para Abastecimento'), { target: { value: '45' } });
    fireEvent.click(screen.getByText('Salvar'));

    await waitFor(() =>
      expect(updateTenantSettingsMock).toHaveBeenCalledWith({
        preferences: expect.objectContaining({ stopDurationThresholdsMinutes: expect.objectContaining({ FUEL: 45 }) }),
      }),
    );
  });
});
