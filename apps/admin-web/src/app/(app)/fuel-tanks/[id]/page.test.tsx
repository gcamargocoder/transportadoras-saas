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
const listFuelStationsMock = vi.fn();
const useAuthMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../../lib/api/fuel-tanks.api', () => ({
  getFuelTank: (...args: unknown[]) => getFuelTankMock(...args),
  getFuelTankMovements: (...args: unknown[]) => getFuelTankMovementsMock(...args),
  updateFuelTankStatus: (...args: unknown[]) => updateFuelTankStatusMock(...args),
  updateFuelTank: vi.fn(),
  registerFuelTankReceipt: (...args: unknown[]) => registerFuelTankReceiptMock(...args),
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

describe('FuelTankDetailPage (Gestão de Combustível, Fase 1)', () => {
  beforeEach(() => {
    getFuelTankMock.mockReset();
    getFuelTankMovementsMock.mockReset();
    updateFuelTankStatusMock.mockReset();
    registerFuelTankReceiptMock.mockReset();
    listFuelStationsMock.mockReset();
    useAuthMock.mockReset();
    pushMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    getFuelTankMovementsMock.mockResolvedValue({ items: [buildMovement()], meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 } });
    listFuelStationsMock.mockResolvedValue({ items: [{ id: 'station-1', name: 'Distribuidora Raizen' }], meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 } });
  });

  it('mostra o saldo, capacidade e a movimentacao de saldo inicial', async () => {
    getFuelTankMock.mockResolvedValue(buildTank());
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tanque matriz' })).toBeInTheDocument();
    expect(screen.getAllByText('8.000 L').length).toBeGreaterThan(0); // estoque atual e inicial
    expect(screen.getByText('15.000 L')).toBeInTheDocument(); // capacidade
    expect(within(screen.getByRole('table')).getByText('Saldo inicial')).toBeInTheDocument();
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

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Abastecimento interno')).toBeInTheDocument();
    expect(within(table).getByText(/ABC1D23/)).toBeInTheDocument();
    expect(within(table).getByText(/José da Silva/)).toBeInTheDocument();
    expect(within(table).getByText(/Origem → Destino/)).toBeInTheDocument();
  });

  it('mostra badge de estoque baixo quando aplicavel', async () => {
    getFuelTankMock.mockResolvedValue(buildTank({ currentStockLiters: 500, occupancyPercent: 3.3, isLowStock: true }));
    renderPage();

    expect(await screen.findByText('Estoque baixo')).toBeInTheDocument();
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
});
