import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import type { FuelSupplyEntity } from '../../types/entities';
import { UpdateFuelSupplyModal } from './update-fuel-supply-modal';

const updateFuelSupplyMock = vi.fn();

vi.mock('../../lib/api/fuel.api', () => ({
  updateFuelSupply: (...args: unknown[]) => updateFuelSupplyMock(...args),
  listFuelStations: () => Promise.resolve({ items: [{ id: 'station-1', name: 'Posto Central' }] }),
}));

function buildSupply(overrides: Partial<FuelSupplyEntity> = {}): FuelSupplyEntity {
  return {
    id: 'supply-1',
    tenantId: 't1',
    vehicleId: 'v1',
    vehiclePlate: 'AAA1111',
    driverId: 'd1',
    driverName: 'José da Silva',
    tripId: null,
    tripLabel: null,
    fuelStationId: null,
    fuelStationName: null,
    fuelTankId: null,
    fuelTankName: null,
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
    source: 'ADMIN',
    createdBy: 'u1',
    creatorName: 'Admin',
    updatedBy: null,
    updaterName: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

function renderModal(supply: FuelSupplyEntity) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<UpdateFuelSupplyModal open onClose={vi.fn()} supply={supply} />, { wrapper: Wrapper });
}

describe('UpdateFuelSupplyModal (Fase 7 -- edicao protegida do abastecimento interno)', () => {
  beforeEach(() => {
    updateFuelSupplyMock.mockReset();
  });

  it('abastecimento externo: mostra o seletor de posto normalmente', () => {
    renderModal(buildSupply({ fuelStationId: 'station-1', fuelStationName: 'Posto Central' }));
    expect(screen.getByLabelText(/^Posto/)).toBeInTheDocument();
    expect(screen.queryByText(/não é possível alterar os litros/i)).not.toBeInTheDocument();
  });

  it('abastecimento interno: esconde o posto, mostra o tanque como informativo e desabilita litros', () => {
    renderModal(buildSupply({ fuelTankId: 'tank-1', fuelTankName: 'Tanque matriz', fuelStationId: null, pricePerLiter: 0, totalAmount: 0 }));
    expect(screen.queryByLabelText('Posto')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Tanque: Tanque matriz')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Litros/)).toBeDisabled();
    expect(screen.getByText(/não é possível alterar os litros/i)).toBeInTheDocument();
  });

  it('interno: salvar nunca envia fuelStationId (permanece nulo, nunca as duas origens juntas)', async () => {
    updateFuelSupplyMock.mockResolvedValue({});
    renderModal(buildSupply({ fuelTankId: 'tank-1', fuelTankName: 'Tanque matriz', fuelStationId: null, pricePerLiter: 0, totalAmount: 0 }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(updateFuelSupplyMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateFuelSupplyMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.fuelStationId).toBeUndefined();
    expect(payload.liters).toBe(200); // inalterado -- nunca quebra o ledger
  });

  it('externo: exige posto ao salvar sem selecionar nenhum', async () => {
    renderModal(buildSupply({ fuelStationId: null }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Selecione o posto.')).toBeInTheDocument();
    expect(updateFuelSupplyMock).not.toHaveBeenCalled();
  });
});
