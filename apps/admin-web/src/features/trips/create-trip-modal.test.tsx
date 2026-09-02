import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import { CreateTripModal } from './create-trip-modal';

const createTripMock = vi.fn();
const listCustomersMock = vi.fn();
const listLocationsMock = vi.fn();
const listTripsMock = vi.fn();
const listTripCompositionsMock = vi.fn();
const listTollRoutesMock = vi.fn();
const listDriversMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../lib/api/trips.api', () => ({
  createTrip: (...args: unknown[]) => createTripMock(...args),
  listCustomers: (...args: unknown[]) => listCustomersMock(...args),
  listLocations: (...args: unknown[]) => listLocationsMock(...args),
  listTrips: (...args: unknown[]) => listTripsMock(...args),
}));

vi.mock('../../lib/api/fleet.api', () => ({
  listTripCompositions: (...args: unknown[]) => listTripCompositionsMock(...args),
}));

vi.mock('../../lib/api/toll-routes.api', () => ({
  listTollRoutes: (...args: unknown[]) => listTollRoutesMock(...args),
}));

vi.mock('../../lib/api/drivers.api', () => ({
  listDrivers: (...args: unknown[]) => listDriversMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<CreateTripModal open onClose={vi.fn()} />, { wrapper: Wrapper });
}

const EMPTY_PAGE = { items: [], meta: { total: 0, page: 1, pageSize: 100, totalPages: 0 } };

// createTripSchema valida origin/destination/driver/composition/
// previousTripId com z.string().uuid() -- os ids de fixture PRECISAM ser
// UUIDs de verdade, senao a validacao do proprio formulario rejeita o
// submit antes de chegar em createTrip (nunca um erro do backend).
const LOC_ORIGIN_ID = '11111111-1111-4111-8111-111111111111';
const LOC_DEST_ID = '22222222-2222-4222-8222-222222222222';
const DRIVER_ID = '33333333-3333-4333-8333-333333333333';
const COMPOSITION_ID = '44444444-4444-4444-8444-444444444444';
const TRIP_IDA_ID = '55555555-5555-4555-8555-555555555555';

// Fase D -- seletor "Viagem de origem / viagem anterior" (previousTripId,
// opcional) e "Carga planejada" (plannedLoadStatus, opcional) no formulario
// de criacao. Nunca substituem loadStatus (definido so na largada pelo
// motorista) -- aqui e so intencao de planejamento.
describe('CreateTripModal -- Fase D (viagem anterior + carga planejada)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCustomersMock.mockResolvedValue(EMPTY_PAGE);
    listLocationsMock.mockResolvedValue({
      items: [
        { id: LOC_ORIGIN_ID, name: 'Catanduva/SP' },
        { id: LOC_DEST_ID, name: 'São Paulo/SP' },
      ],
      meta: { total: 2, page: 1, pageSize: 100, totalPages: 1 },
    });
    listDriversMock.mockResolvedValue({
      items: [{ id: DRIVER_ID, name: 'José da Silva' }],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    listTripCompositionsMock.mockResolvedValue({
      items: [{ id: COMPOSITION_ID, vehiclePlate: 'ABC1D23', trailers: [] }],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    listTollRoutesMock.mockResolvedValue(EMPTY_PAGE);
    listTripsMock.mockResolvedValue({
      items: [{ id: TRIP_IDA_ID, originName: 'São Paulo/SP', destinationName: 'Catanduva/SP' }],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    createTripMock.mockResolvedValue({ id: 'trip-new' });
  });

  it('renderiza o seletor de viagem anterior com as opcoes do tenant', async () => {
    renderModal();

    expect(await screen.findByText('São Paulo/SP → Catanduva/SP')).toBeTruthy();
    expect(listTripsMock).toHaveBeenCalled();
  });

  it('sem selecionar viagem anterior nem carga planejada: cria sem esses campos no payload', async () => {
    renderModal();
    await screen.findByText('São Paulo/SP → Catanduva/SP');
    // EntitySelect fica disabled enquanto sua propria query carrega -- espera
    // ela habilitar antes de disparar o change (senao o evento e ignorado).
    await waitFor(() => {
      expect(screen.getByLabelText(/^Origem/)).toBeEnabled();
      expect(screen.getByLabelText(/^Destino/)).toBeEnabled();
      expect(screen.getByLabelText(/^Motorista/)).toBeEnabled();
      expect(screen.getByLabelText(/^Composição \(veículo \+ carretas\)/)).toBeEnabled();
    });

    fireEvent.change(screen.getByLabelText(/^Origem/), { target: { value: LOC_ORIGIN_ID } });
    fireEvent.change(screen.getByLabelText(/^Destino/), { target: { value: LOC_DEST_ID } });
    fireEvent.change(screen.getByLabelText(/^Motorista/), { target: { value: DRIVER_ID } });
    fireEvent.change(screen.getByLabelText(/^Composição \(veículo \+ carretas\)/), { target: { value: COMPOSITION_ID } });
    fireEvent.change(screen.getByLabelText(/^Saída prevista/), { target: { value: '2026-09-01T08:00' } });
    fireEvent.change(screen.getByLabelText(/^Chegada prevista/), { target: { value: '2026-09-02T18:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar viagem' }));

    await waitFor(() => expect(createTripMock).toHaveBeenCalledTimes(1));
    const payload = createTripMock.mock.calls[0]![0];
    expect(payload.previousTripId).toBeUndefined();
    expect(payload.plannedLoadStatus).toBeUndefined();
  });

  it('selecionar viagem anterior e carga planejada: envia ambos no payload de criacao', async () => {
    renderModal();
    await screen.findByText('São Paulo/SP → Catanduva/SP');
    await waitFor(() => {
      expect(screen.getByLabelText(/^Origem/)).toBeEnabled();
      expect(screen.getByLabelText(/^Destino/)).toBeEnabled();
      expect(screen.getByLabelText(/^Motorista/)).toBeEnabled();
      expect(screen.getByLabelText(/^Composição \(veículo \+ carretas\)/)).toBeEnabled();
    });

    fireEvent.change(screen.getByLabelText(/^Origem/), { target: { value: LOC_ORIGIN_ID } });
    fireEvent.change(screen.getByLabelText(/^Destino/), { target: { value: LOC_DEST_ID } });
    fireEvent.change(screen.getByLabelText(/^Motorista/), { target: { value: DRIVER_ID } });
    fireEvent.change(screen.getByLabelText(/^Composição \(veículo \+ carretas\)/), { target: { value: COMPOSITION_ID } });
    fireEvent.change(screen.getByLabelText('Viagem de origem / viagem anterior'), {
      target: { value: TRIP_IDA_ID },
    });
    fireEvent.change(screen.getByLabelText('Carga planejada'), { target: { value: 'EMPTY' } });
    fireEvent.change(screen.getByLabelText(/^Saída prevista/), { target: { value: '2026-09-01T08:00' } });
    fireEvent.change(screen.getByLabelText(/^Chegada prevista/), { target: { value: '2026-09-02T18:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar viagem' }));

    await waitFor(() => expect(createTripMock).toHaveBeenCalledTimes(1));
    const payload = createTripMock.mock.calls[0]![0];
    expect(payload.previousTripId).toBe(TRIP_IDA_ID);
    expect(payload.plannedLoadStatus).toBe('EMPTY');
  });

  it('a opcao "Não informado" fica disponivel e e o default de carga planejada', async () => {
    renderModal();
    await screen.findByText('São Paulo/SP → Catanduva/SP');

    expect(screen.getByLabelText('Carga planejada')).toHaveValue('');
    expect(screen.getByText('Não informado')).toBeTruthy();
  });
});
