import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../../components/ui/toast';
import type { FuelTankEntity, FuelTankMovementEntity } from '../../../../types/entities';
import FuelTankDetailPage from './page';

const getFuelTankMock = vi.fn();
const getFuelTankMovementsMock = vi.fn();
const updateFuelTankStatusMock = vi.fn();
const registerFuelTankReceiptMock = vi.fn();
const registerFuelTankInventoryCheckMock = vi.fn();
const getFuelTankInventoryChecksMock = vi.fn();
const listFuelStationsMock = vi.fn();
const useAuthMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../../lib/api/fuel-tanks.api', () => ({
  getFuelTank: (...args: unknown[]) => getFuelTankMock(...args),
  getFuelTankMovements: (...args: unknown[]) => getFuelTankMovementsMock(...args),
  updateFuelTankStatus: (...args: unknown[]) => updateFuelTankStatusMock(...args),
  updateFuelTank: vi.fn(),
  registerFuelTankReceipt: (...args: unknown[]) => registerFuelTankReceiptMock(...args),
  registerFuelTankInventoryCheck: (...args: unknown[]) => registerFuelTankInventoryCheckMock(...args),
  getFuelTankInventoryChecks: (...args: unknown[]) => getFuelTankInventoryChecksMock(...args),
}));

vi.mock('../../../../lib/api/fuel.api', () => ({
  listFuelStations: (...args: unknown[]) => listFuelStationsMock(...args),
}));

vi.mock('../../../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'tank-1' }),
  useRouter: () => ({ push: pushMock }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<FuelTankDetailPage />, { wrapper: Wrapper });
}

function buildTank(overrides: Partial<FuelTankEntity> = {}): FuelTankEntity {
  return {
    id: 'tank-1',
    tenantId: 't1',
    name: 'Tanque matriz',
    fuelType: 'DIESEL_S10',
    capacityLiters: 15000,
    initialStockLiters: 8000,
    currentStockLiters: 8000,
    minStockLiters: 2000,
    occupancyPercent: 53.3,
    isLowStock: false,
    location: 'Pátio central',
    status: 'ACTIVE',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

function buildMovement(overrides: Partial<FuelTankMovementEntity> = {}): FuelTankMovementEntity {
  return {
    id: 'mov-1',
    tankId: 'tank-1',
    type: 'INITIAL_BALANCE',
    quantityLiters: 8000,
    previousBalanceLiters: 0,
    newBalanceLiters: 8000,
    effectiveDate: '2026-09-01T08:00:00.000Z',
    notes: 'Saldo inicial na criação do tanque.',
    pricePerLiter: null,
    totalAmount: null,
    invoiceNumber: null,
    fuelStationId: null,
    fuelSupplyId: null,
    vehicleId: null,
    vehiclePlate: null,
    driverId: null,
    driverName: null,
    tripId: null,
    tripLabel: null,
    createdBy: 'u1',
    createdAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

const emptyPage = { items: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } };

describe('FuelTankDetailPage (Gestão de Combustível, Fase 1)', () => {
  beforeEach(() => {
    getFuelTankMock.mockReset();
    getFuelTankMovementsMock.mockReset();
    updateFuelTankStatusMock.mockReset();
    registerFuelTankReceiptMock.mockReset();
    registerFuelTankInventoryCheckMock.mockReset();
    getFuelTankInventoryChecksMock.mockReset();
    listFuelStationsMock.mockReset();
    useAuthMock.mockReset();
    pushMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    getFuelTankMovementsMock.mockResolvedValue({ items: [buildMovement()], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } });
    getFuelTankInventoryChecksMock.mockResolvedValue(emptyPage);
    listFuelStationsMock.mockResolvedValue({ items: [{ id: 'station-1', name: 'Distribuidora Raizen' }], meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 } });
  });

  it('mostra o estoque e a capacidade no hero, e a movimentacao de saldo inicial na aba Movimentações', async () => {
    getFuelTankMock.mockResolvedValue(buildTank());
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tanque matriz' })).toBeInTheDocument();
    expect(screen.getByText(/^8\.000$/)).toBeInTheDocument(); // estoque atual (hero)
    expect(screen.getByText(/15\.000 L de capacidade/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Movimentações' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Saldo inicial')).toBeInTheDocument();
  });

  it('mostra veiculo/motorista/viagem no historico de um abastecimento interno (Fase 3)', async () => {
    getFuelTankMock.mockResolvedValue(buildTank());
    getFuelTankMovementsMock.mockResolvedValue({
      items: [
        buildMovement({
          id: 'mov-internal',
          type: 'INTERNAL_FUELING',
          quantityLiters: 300,
          previousBalanceLiters: 8000,
          newBalanceLiters: 7700,
          vehicleId: 'v1',
          vehiclePlate: 'ABC1D23',
          driverId: 'd1',
          driverName: 'José da Silva',
          tripId: 't1',
          tripLabel: 'Origem → Destino',
        }),
      ],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
    renderPage();

    fireEvent.click(await screen.findByRole('tab', { name: 'Movimentações' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Abastecimento interno')).toBeInTheDocument();
    expect(within(table).getByText(/ABC1D23/)).toBeInTheDocument();
    expect(within(table).getByText(/José da Silva/)).toBeInTheDocument();
    expect(within(table).getByText(/Origem → Destino/)).toBeInTheDocument();
  });

  describe('severidade do hero (Fase 5): normal/atenção/crítico', () => {
    it('Normal quando o estoque nao esta baixo', async () => {
      getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 8000, isLowStock: false }));
      renderPage();
      expect(await screen.findByText('Normal')).toBeInTheDocument();
    });

    it('Atenção quando esta baixo mas acima da metade do minimo', async () => {
      getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 1500, minStockLiters: 2000, isLowStock: true }));
      renderPage();
      expect(await screen.findByText('Atenção')).toBeInTheDocument();
    });

    it('Crítico quando cai a metade do minimo configurado', async () => {
      getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 500, minStockLiters: 2000, occupancyPercent: 3.3, isLowStock: true }));
      renderPage();
      expect(await screen.findByText('Crítico')).toBeInTheDocument();
    });
  });

  it('ativa/desativa o tanque', async () => {
    getFuelTankMock.mockResolvedValue(buildTank());
    updateFuelTankStatusMock.mockResolvedValue(buildTank({ status: 'INACTIVE' }));
    renderPage();

    const deactivateButton = await screen.findByRole('button', { name: /Desativar/i });
    fireEvent.click(deactivateButton);

    await waitFor(() => expect(updateFuelTankStatusMock).toHaveBeenCalledWith('tank-1', false));
  });

  it('nao mostra acoes de escrita para papel sem permissao', async () => {
    useAuthMock.mockReturnValue({ user: { role: 'AUDITOR' } });
    getFuelTankMock.mockResolvedValue(buildTank());
    renderPage();

    await screen.findByRole('heading', { name: 'Tanque matriz' });
    expect(screen.queryByRole('button', { name: /Desativar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Receber diesel/i })).not.toBeInTheDocument();
  });

  it('mostra estado de erro com opção de tentar novamente', async () => {
    getFuelTankMock.mockRejectedValue(new Error('falha de rede'));
    renderPage();
    expect(await screen.findByRole('button', { name: /Tentar novamente/i })).toBeInTheDocument();
  });

  describe('Visão geral (Fase 5): fluxo, indicadores e gráficos', () => {
    it('sem movimentações: fluxo e gráficos mostram estado de ausência de dados, nunca zero artificial', async () => {
      getFuelTankMock.mockResolvedValue(buildTank());
      getFuelTankMovementsMock.mockResolvedValue(emptyPage);
      renderPage();

      expect(await screen.findByText('Nenhuma entrada registrada.')).toBeInTheDocument();
      expect(screen.getByText('Nenhum abastecimento interno registrado.')).toBeInTheDocument();
      expect(screen.getByText('Nenhum ajuste registrado.')).toBeInTheDocument();
      expect(screen.getByText('Sem movimentações suficientes')).toBeInTheDocument();
      expect(screen.getByText('Sem entradas ou saídas suficientes')).toBeInTheDocument();
      expect(screen.getByText('Sem preço suficiente')).toBeInTheDocument();
      // Indicadores sem base -- "-", nunca "0" inventado.
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('com entrada e saída recentes: fluxo mostra os dois lados com os dados reais do ledger', async () => {
      getFuelTankMock.mockResolvedValue(buildTank());
      getFuelTankMovementsMock.mockResolvedValue({
        items: [
          buildMovement({
            id: 'mov-fueling',
            type: 'INTERNAL_FUELING',
            quantityLiters: 300,
            vehiclePlate: 'ABC1D23',
            driverName: 'José da Silva',
            effectiveDate: '2026-09-05T10:00:00.000Z',
          }),
          buildMovement({
            id: 'mov-receipt',
            type: 'RECEIPT',
            quantityLiters: 2000,
            pricePerLiter: 5.5,
            totalAmount: 11000,
            effectiveDate: '2026-09-04T10:00:00.000Z',
          }),
        ],
        meta: { total: 2, page: 1, pageSize: 100, totalPages: 1 },
      });
      renderPage();

      expect(await screen.findByText('+2.000 L')).toBeInTheDocument();
      expect(screen.getByText('-300 L')).toBeInTheDocument();
      expect(screen.getByText(/ABC1D23/)).toBeInTheDocument();
      expect(screen.getByText(/José da Silva/)).toBeInTheDocument();
      // Indicadores agregados da janela recente (rotulo -> valor do StatCard).
      expect(screen.getByText('Litros recebidos').closest('div')?.parentElement).toHaveTextContent('2.000 L');
      expect(screen.getByText('Litros abastecidos').closest('div')?.parentElement).toHaveTextContent('300 L');
    });
  });

  describe('Abastecimentos (Fase 5): tabela investigativa de INTERNAL_FUELING', () => {
    it('mostra estado vazio quando nao ha abastecimento interno', async () => {
      getFuelTankMock.mockResolvedValue(buildTank());
      getFuelTankMovementsMock.mockResolvedValue(emptyPage);
      renderPage();

      fireEvent.click(await screen.findByRole('tab', { name: 'Abastecimentos' }));
      expect(await screen.findByText('Nenhum abastecimento interno registrado')).toBeInTheDocument();
    });

    it('lista veiculo/motorista/viagem/litros do abastecimento interno', async () => {
      getFuelTankMock.mockResolvedValue(buildTank());
      getFuelTankMovementsMock.mockResolvedValue({
        items: [
          buildMovement({
            id: 'mov-internal',
            type: 'INTERNAL_FUELING',
            quantityLiters: 300,
            newBalanceLiters: 7700,
            vehiclePlate: 'ABC1D23',
            driverName: 'José da Silva',
            tripLabel: 'Origem → Destino',
          }),
        ],
        meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
      });
      renderPage();

      fireEvent.click(await screen.findByRole('tab', { name: 'Abastecimentos' }));
      const table = await screen.findByRole('table');
      expect(within(table).getByText('ABC1D23')).toBeInTheDocument();
      expect(within(table).getByText('José da Silva')).toBeInTheDocument();
      expect(within(table).getByText('Origem → Destino')).toBeInTheDocument();
      expect(within(table).getByText('300 L')).toBeInTheDocument();
    });
  });

  describe('Receber diesel (RECEIPT, Fase 2)', () => {
    it('abre o formulario, calcula o total e a previa do novo estoque', async () => {
      getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 7550, capacityLiters: 15000 }));
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: /Receber diesel/i }));
      expect(await screen.findByRole('heading', { name: 'Receber diesel' })).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Quantidade (litros)', { exact: false }), { target: { value: '2000' } });
      fireEvent.change(screen.getByLabelText('Preço por litro (R$)', { exact: false }), { target: { value: '5' } });

      expect(await screen.findByText('9.550 L')).toBeInTheDocument(); // novo estoque
      expect(screen.getByText(/R\$\s*10\.000,00/)).toBeInTheDocument(); // valor total (2000 * 5)
    });

    it('impede o envio quando a entrada excede a capacidade e explica o motivo', async () => {
      getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 9500, capacityLiters: 10000 }));
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: /Receber diesel/i }));
      await screen.findByRole('heading', { name: 'Receber diesel' });

      fireEvent.change(screen.getByLabelText('Quantidade (litros)', { exact: false }), { target: { value: '600' } });
      fireEvent.change(screen.getByLabelText('Preço por litro (R$)', { exact: false }), { target: { value: '5' } });

      expect(await screen.findByText(/excede a capacidade do tanque em 100 L/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Registrar entrada' })).toBeDisabled();
      expect(registerFuelTankReceiptMock).not.toHaveBeenCalled();
    });

    it('registra a entrada com sucesso e atualiza saldo/historico', async () => {
      getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 7550, capacityLiters: 15000 }));
      registerFuelTankReceiptMock.mockResolvedValue({
        tank: buildTank({ currentStockLiters: 9550, capacityLiters: 15000 }),
        movement: buildMovement({ id: 'mov-2', type: 'RECEIPT', quantityLiters: 2000 }),
      });
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: /Receber diesel/i }));
      await screen.findByRole('heading', { name: 'Receber diesel' });

      fireEvent.change(screen.getByLabelText('Quantidade (litros)', { exact: false }), { target: { value: '2000' } });
      fireEvent.change(screen.getByLabelText('Preço por litro (R$)', { exact: false }), { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));

      await waitFor(() =>
        expect(registerFuelTankReceiptMock).toHaveBeenCalledWith('tank-1', expect.objectContaining({ quantityLiters: 2000, pricePerLiter: 5 })),
      );
      await waitFor(() => expect(screen.queryByRole('heading', { name: 'Receber diesel' })).not.toBeInTheDocument());
    });

    it('mostra erro da API e mantem o formulario aberto para correcao', async () => {
      getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 7550, capacityLiters: 15000 }));
      registerFuelTankReceiptMock.mockRejectedValue(new Error('falha de rede'));
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: /Receber diesel/i }));
      await screen.findByRole('heading', { name: 'Receber diesel' });

      fireEvent.change(screen.getByLabelText('Quantidade (litros)', { exact: false }), { target: { value: '2000' } });
      fireEvent.change(screen.getByLabelText('Preço por litro (R$)', { exact: false }), { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Registrar entrada' }));

      await waitFor(() => expect(registerFuelTankReceiptMock).toHaveBeenCalled());
      expect(screen.getByRole('heading', { name: 'Receber diesel' })).toBeInTheDocument(); // continua aberto
    });
  });

  describe('Conferir estoque (inventario, Fase 4)', () => {
    it('sem divergencia: mostra um unico botao e registra applyAdjustment=false', async () => {
      getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 7550 }));
      registerFuelTankInventoryCheckMock.mockResolvedValue({
        tank: buildTank({ currentStockLiters: 7550 }),
        check: { id: 'chk-1', tankId: 'tank-1', checkedAt: '2026-09-01T08:00:00.000Z', theoreticalStockLiters: 7550, measuredStockLiters: 7550, divergenceLiters: 0, divergencePercent: 0, adjusted: false, adjustmentMovementId: null, notes: null, createdBy: 'u1', createdAt: '2026-09-01T08:00:00.000Z' },
      });
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: /Conferir estoque/i }));
      await screen.findByRole('heading', { name: 'Conferir estoque' });

      fireEvent.change(screen.getByLabelText('Medição física (litros)', { exact: false }), { target: { value: '7550' } });

      expect(await screen.findByText('Estoque conferido -- sem divergência.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirmar ajuste' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Registrar sem ajustar' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Registrar conferência' }));

      await waitFor(() =>
        expect(registerFuelTankInventoryCheckMock).toHaveBeenCalledWith('tank-1', expect.objectContaining({ measuredStockLiters: 7550, applyAdjustment: false })),
      );
    });

    it('com divergencia: exige motivo para confirmar o ajuste', async () => {
      getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 7550 }));
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: /Conferir estoque/i }));
      await screen.findByRole('heading', { name: 'Conferir estoque' });

      fireEvent.change(screen.getByLabelText('Medição física (litros)', { exact: false }), { target: { value: '7480' } });
      expect(await screen.findByText(/-70/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar ajuste' }));

      expect(await screen.findByText('Informe o motivo da divergência para confirmar o ajuste.')).toBeInTheDocument();
      expect(registerFuelTankInventoryCheckMock).not.toHaveBeenCalled();
    });

    it('com divergencia e motivo: confirma o ajuste com applyAdjustment=true', async () => {
      getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 7550 }));
      registerFuelTankInventoryCheckMock.mockResolvedValue({
        tank: buildTank({ currentStockLiters: 7480 }),
        check: { id: 'chk-2', tankId: 'tank-1', checkedAt: '2026-09-01T08:00:00.000Z', theoreticalStockLiters: 7550, measuredStockLiters: 7480, divergenceLiters: -70, divergencePercent: -0.9, adjusted: true, adjustmentMovementId: 'mov-2', notes: 'Vazamento', createdBy: 'u1', createdAt: '2026-09-01T08:00:00.000Z' },
      });
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: /Conferir estoque/i }));
      await screen.findByRole('heading', { name: 'Conferir estoque' });

      fireEvent.change(screen.getByLabelText('Medição física (litros)', { exact: false }), { target: { value: '7480' } });
      await screen.findByText(/-70/);
      fireEvent.change(screen.getByLabelText('Motivo da divergência', { exact: false }), { target: { value: 'Vazamento' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar ajuste' }));

      await waitFor(() =>
        expect(registerFuelTankInventoryCheckMock).toHaveBeenCalledWith(
          'tank-1',
          expect.objectContaining({ measuredStockLiters: 7480, applyAdjustment: true, notes: 'Vazamento' }),
        ),
      );
    });

    it('com divergencia: "Registrar sem ajustar" envia applyAdjustment=false mesmo sem motivo', async () => {
      getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 7550 }));
      registerFuelTankInventoryCheckMock.mockResolvedValue({
        tank: buildTank({ currentStockLiters: 7550 }),
        check: { id: 'chk-3', tankId: 'tank-1', checkedAt: '2026-09-01T08:00:00.000Z', theoreticalStockLiters: 7550, measuredStockLiters: 7480, divergenceLiters: -70, divergencePercent: -0.9, adjusted: false, adjustmentMovementId: null, notes: null, createdBy: 'u1', createdAt: '2026-09-01T08:00:00.000Z' },
      });
      renderPage();

      fireEvent.click(await screen.findByRole('button', { name: /Conferir estoque/i }));
      await screen.findByRole('heading', { name: 'Conferir estoque' });

      fireEvent.change(screen.getByLabelText('Medição física (litros)', { exact: false }), { target: { value: '7480' } });
      await screen.findByText(/-70/);
      fireEvent.click(screen.getByRole('button', { name: 'Registrar sem ajustar' }));

      await waitFor(() =>
        expect(registerFuelTankInventoryCheckMock).toHaveBeenCalledWith('tank-1', expect.objectContaining({ applyAdjustment: false })),
      );
    });

    it('mostra o historico de conferencias com divergencia e status de ajuste', async () => {
      getFuelTankMock.mockResolvedValue(buildTank());
      getFuelTankInventoryChecksMock.mockResolvedValue({
        items: [
          {
            id: 'chk-1',
            tankId: 'tank-1',
            checkedAt: '2026-09-01T08:00:00.000Z',
            theoreticalStockLiters: 7550,
            measuredStockLiters: 7480,
            divergenceLiters: -70,
            divergencePercent: -0.9,
            adjusted: true,
            adjustmentMovementId: 'mov-2',
            notes: 'Vazamento identificado.',
            createdBy: 'u1',
            createdAt: '2026-09-01T08:00:00.000Z',
          },
        ],
        meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
      });
      renderPage();

      fireEvent.click(await screen.findByRole('tab', { name: 'Conferências' }));
      expect(await screen.findByText('Conferências de estoque')).toBeInTheDocument();
      expect((await screen.findAllByText(/Vazamento identificado\./)).length).toBeGreaterThan(0);
    });
  });
});
