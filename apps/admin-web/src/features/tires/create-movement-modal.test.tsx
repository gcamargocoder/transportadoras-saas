import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import { CreateMovementModal } from './create-movement-modal';

const createTireMovementMock = vi.fn();
const listVehiclesMock = vi.fn();
const listMaintenancesMock = vi.fn();

vi.mock('../../lib/api/tires.api', () => ({
  createTireMovement: (...args: unknown[]) => createTireMovementMock(...args),
}));

vi.mock('../../lib/api/fleet.api', () => ({
  listVehicles: (...args: unknown[]) => listVehiclesMock(...args),
  listTrailers: () => Promise.resolve({ items: [] }),
  listMaintenances: (...args: unknown[]) => listMaintenancesMock(...args),
}));

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<CreateMovementModal open onClose={onClose} tireId="tire-1" />, { wrapper: Wrapper });
}

// Fase 109 -- fecha a lacuna real documentada em docs/tire-management.md
// secao 9 ("nao existe tireId em VehicleMaintenance"): permite vincular a
// troca a uma OS existente. Backend ja aceita `maintenanceId` opcional.
describe('CreateMovementModal -- vinculo com OS (Fase 109)', () => {
  beforeEach(() => {
    createTireMovementMock.mockReset();
    listVehiclesMock.mockReset();
    listMaintenancesMock.mockReset();
    listVehiclesMock.mockResolvedValue({ items: [{ id: 'v1', plate: 'ABC1D23' }] });
    listMaintenancesMock.mockResolvedValue({
      items: [{ id: 'm1', serviceOrderNumber: 'OS-1234', vehiclePlate: 'ABC1D23', status: 'OPEN' }],
    });
    createTireMovementMock.mockResolvedValue({ id: 'mv1' });
  });

  it('registra uma movimentação sem selecionar OS -- nunca envia maintenanceId (zero regressão)', async () => {
    renderModal();

    fireEvent.click(await screen.findByText('Registrar'));

    await waitFor(() => expect(createTireMovementMock).toHaveBeenCalled());
    const payload = createTireMovementMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.maintenanceId).toBeUndefined();
  });

  it('vincula a movimentação a uma OS selecionada, enviando maintenanceId', async () => {
    renderModal();

    const osSelect = await screen.findByLabelText('Ordem de serviço');
    await waitFor(() => expect(osSelect.querySelector('option[value="m1"]')).not.toBeNull());
    fireEvent.change(osSelect, { target: { value: 'm1' } });

    fireEvent.click(screen.getByText('Registrar'));

    await waitFor(() => expect(createTireMovementMock).toHaveBeenCalled());
    const payload = createTireMovementMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.maintenanceId).toBe('m1');
  });
});
