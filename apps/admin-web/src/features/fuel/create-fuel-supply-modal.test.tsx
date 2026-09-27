import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import { CreateFuelSupplyModal } from './create-fuel-supply-modal';

const createFuelSupplyMock = vi.fn();
const listFuelTanksMock = vi.fn();

vi.mock('../../lib/api/fuel.api', () => ({
  createFuelSupply: (...args: unknown[]) => createFuelSupplyMock(...args),
  listFuelStations: () => Promise.resolve({ items: [{ id: 'station-1', name: 'Posto Central' }] }),
}));

vi.mock('../../lib/api/fuel-tanks.api', () => ({
  listFuelTanks: (...args: unknown[]) => listFuelTanksMock(...args),
}));

vi.mock('../../lib/api/trips.api', () => ({ listTrips: () => Promise.resolve({ items: [] }) }));
vi.mock('../../lib/api/drivers.api', () => ({ listDrivers: () => Promise.resolve({ items: [{ id: 'driver-1', name: 'José da Silva' }] }) }));
vi.mock('../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [{ id: 'vehicle-1', plate: 'AAA1111', brand: 'Volvo', model: 'FH' }] }),
}));

function renderModal(props: Partial<Parameters<typeof CreateFuelSupplyModal>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<CreateFuelSupplyModal open onClose={vi.fn()} {...props} />, { wrapper: Wrapper });
}

async function fillCommonFields() {
  // Espera as opcoes carregarem (EntitySelect mostra "Carregando..." ate a
  // query resolver) antes de selecionar -- evita corrida com o useQuery.
  await screen.findByRole('option', { name: 'AAA1111 · Volvo FH' });
  await userEvent.selectOptions(screen.getByLabelText(/^Veículo/), 'vehicle-1');
  await userEvent.selectOptions(screen.getByLabelText(/^Motorista/), 'driver-1');
  await userEvent.type(screen.getByLabelText(/^Litros/), '100');
  await userEvent.type(screen.getByLabelText(/^Odômetro \(km\)/), '100500');
  const dateInput = screen.getByLabelText(/^Data do abastecimento/);
  await userEvent.type(dateInput, '2026-09-27T10:00');
}

describe('CreateFuelSupplyModal (Fase 7 -- interno x externo)', () => {
  beforeEach(() => {
    createFuelSupplyMock.mockReset();
    listFuelTanksMock.mockReset();
    listFuelTanksMock.mockResolvedValue({
      items: [{ id: 'tank-1', name: 'Tanque matriz', currentStockLiters: 1000 }],
    });
  });

  it('por padrão mostra o formulário externo (posto opcional, preço obrigatório)', () => {
    renderModal();
    expect(screen.getByLabelText('Posto')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tanque de origem')).not.toBeInTheDocument();
  });

  it('ao trocar para interno, esconde o posto e mostra o seletor de tanque', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('radio', { name: 'Abastecimento interno (tanque próprio)' }));
    expect(screen.queryByLabelText('Posto')).not.toBeInTheDocument();
    expect(await screen.findByLabelText(/^Tanque de origem/)).toBeInTheDocument();
  });

  it('selecionar um tanque mostra a prévia de estoque (atual − litros = novo estoque)', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('radio', { name: 'Abastecimento interno (tanque próprio)' }));
    const tankSelect = await screen.findByLabelText(/^Tanque de origem/);
    await userEvent.selectOptions(tankSelect, 'tank-1');
    await userEvent.type(screen.getByLabelText(/^Litros/), '300');

    expect(await screen.findByText('Novo estoque (estimado)')).toBeInTheDocument();
    expect(screen.getByText('700 L')).toBeInTheDocument(); // 1000 - 300
  });

  it('interno sem selecionar tanque: bloqueia o envio com mensagem de validação', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('radio', { name: 'Abastecimento interno (tanque próprio)' }));
    await fillCommonFields();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByText('Selecione o tanque de origem.')).toBeInTheDocument();
    expect(createFuelSupplyMock).not.toHaveBeenCalled();
  });

  it('externo sem preço por litro: bloqueia o envio com mensagem de validação', async () => {
    renderModal();
    await fillCommonFields();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByText('Informe o preço por litro.')).toBeInTheDocument();
    expect(createFuelSupplyMock).not.toHaveBeenCalled();
  });

  it('registra abastecimento interno sem exigir preço nem posto', async () => {
    createFuelSupplyMock.mockResolvedValue({ id: 'supply-1' });
    renderModal();
    await userEvent.click(screen.getByRole('radio', { name: 'Abastecimento interno (tanque próprio)' }));
    const tankSelect = await screen.findByLabelText(/^Tanque de origem/);
    await userEvent.selectOptions(tankSelect, 'tank-1');
    await fillCommonFields();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(createFuelSupplyMock).toHaveBeenCalledTimes(1));
    const payload = createFuelSupplyMock.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ fuelTankId: 'tank-1', fuelStationId: undefined, pricePerLiter: undefined });
  });

  it('registra abastecimento externo com posto e preço informados', async () => {
    createFuelSupplyMock.mockResolvedValue({ id: 'supply-2' });
    renderModal();
    await screen.findByRole('option', { name: 'Posto Central' });
    await userEvent.selectOptions(screen.getByLabelText('Posto'), 'station-1');
    await userEvent.type(screen.getByLabelText(/^Preço por litro/), '5.5');
    await fillCommonFields();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(createFuelSupplyMock).toHaveBeenCalledTimes(1));
    const payload = createFuelSupplyMock.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ fuelStationId: 'station-1', pricePerLiter: 5.5, fuelTankId: undefined });
  });

  it('erro ao registrar mostra um toast de falha', async () => {
    createFuelSupplyMock.mockRejectedValue(new Error('falhou'));
    renderModal();
    await screen.findByRole('option', { name: 'Posto Central' });
    await userEvent.selectOptions(screen.getByLabelText('Posto'), 'station-1');
    await userEvent.type(screen.getByLabelText(/^Preço por litro/), '5.5');
    await fillCommonFields();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar' }));

    expect(await screen.findByText('Não foi possível registrar o abastecimento.')).toBeInTheDocument();
  });
});
