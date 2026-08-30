import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/ui/toast';
import type { FuelSupplyEntity } from '../../../types/entities';
import { FuelTab } from './fuel-tab';

const listFuelSuppliesMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('../../../lib/api/fuel.api', () => ({
  listFuelSupplies: (...args: unknown[]) => listFuelSuppliesMock(...args),
  listFuelStations: () => Promise.resolve({ items: [] }),
}));

vi.mock('../../../lib/api/trips.api', () => ({
  listTrips: () => Promise.resolve({ items: [] }),
}));

vi.mock('../../../lib/api/drivers.api', () => ({
  listDrivers: () => Promise.resolve({ items: [] }),
}));

vi.mock('../../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [] }),
}));

vi.mock('../../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<FuelTab tripId="trip-1" />, { wrapper: Wrapper });
}

function buildSupply(overrides: Partial<FuelSupplyEntity> = {}): FuelSupplyEntity {
  return {
    id: 'supply-1',
    tenantId: 't1',
    vehicleId: 'v1',
    vehiclePlate: 'ABC1D23',
    driverId: 'd1',
    driverName: 'José da Silva',
    tripId: 'trip-1',
    tripLabel: 'Catanduva/SP → São Paulo/SP',
    fuelStationId: 'fs1',
    fuelStationName: 'Posto Central',
    attachmentId: null,
    fuelType: 'DIESEL_S10',
    liters: 200,
    pricePerLiter: 6,
    totalAmount: 1200,
    odometerKm: 100000,
    supplyDate: '2026-09-01T10:00:00.000Z',
    paymentType: null,
    invoiceNumber: null,
    notes: null,
    createdBy: 'u1',
    creatorName: 'Admin',
    updatedBy: null,
    updaterName: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

// Fase 107 -- fecha a lacuna de "contexto da viagem": antes desta fase nao
// havia como ver os abastecimentos de uma viagem especifica sem ir a tela
// global /fuel-supplies e filtrar manualmente. Reaproveita GET
// /fuel-supplies?tripId=... (mesmo endpoint/servico, nenhuma consulta nova).
describe('FuelTab (Fase 107)', () => {
  beforeEach(() => {
    listFuelSuppliesMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
  });

  it('mostra estado vazio quando a viagem nao tem abastecimentos', async () => {
    listFuelSuppliesMock.mockResolvedValue({
      items: [],
      meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
    });
    renderTab();

    expect(await screen.findByText('Nenhum abastecimento registrado nesta viagem')).toBeInTheDocument();
  });

  it('lista os abastecimentos desta viagem e soma total/litros, chamando o endpoint ja existente com tripId', async () => {
    listFuelSuppliesMock.mockResolvedValue({
      items: [buildSupply(), buildSupply({ id: 'supply-2', liters: 100, totalAmount: 600 })],
      meta: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
    });
    renderTab();

    expect((await screen.findAllByText('Posto Central')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('R$ 1.800,00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('300 L').length).toBeGreaterThan(0);
    expect(listFuelSuppliesMock).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: 'trip-1' }),
    );
  });

  it('esconde "Registrar abastecimento" para perfil somente leitura (AUDITOR)', async () => {
    useAuthMock.mockReturnValue({ user: { role: 'AUDITOR' } });
    listFuelSuppliesMock.mockResolvedValue({
      items: [],
      meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
    });
    renderTab();

    await screen.findByText('Nenhum abastecimento registrado nesta viagem');
    expect(screen.queryByText('Registrar abastecimento')).not.toBeInTheDocument();
  });

  it('abre o modal de novo abastecimento com a viagem ja pre-selecionada', async () => {
    listFuelSuppliesMock.mockResolvedValue({
      items: [],
      meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
    });
    renderTab();

    fireEvent.click(await screen.findByText('Registrar abastecimento'));

    await waitFor(() => expect(screen.getByText('Novo abastecimento')).toBeInTheDocument());
    // O campo "Viagem" do modal vem pre-preenchido com trip-1 -- o campo
    // Veiculo/Motorista (obrigatorios so sem viagem) NAO devem aparecer.
    expect(screen.queryByLabelText('Veículo')).not.toBeInTheDocument();
  });
});
