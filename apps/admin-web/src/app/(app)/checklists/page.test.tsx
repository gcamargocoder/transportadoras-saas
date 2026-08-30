import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChecklistExecutionEntity } from '../../../types/entities';
import ChecklistsPage from './page';

const listChecklistExecutionsMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../lib/api/checklist.api', () => ({
  listChecklistExecutions: (...args: unknown[]) => listChecklistExecutionsMock(...args),
}));

vi.mock('../../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [{ id: 'vehicle-1', plate: 'ABC1D23', brand: 'Volvo', model: 'FH 540' }] }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<ChecklistsPage />, { wrapper: Wrapper });
}

function buildExecution(overrides: Partial<ChecklistExecutionEntity> = {}): ChecklistExecutionEntity {
  return {
    id: 'exec-1',
    tenantId: 't1',
    templateId: 'template-1',
    templateVersion: 1,
    templateName: 'Sider Pré-Viagem',
    templateType: 'PRE_TRIP',
    tripId: null,
    tripDestinationName: null,
    driverId: 'driver-1',
    driverName: 'José da Silva',
    vehicleId: 'vehicle-1',
    vehiclePlate: 'ABC1D23',
    trailerId: null,
    status: 'COMPLETED',
    startedAt: '2026-09-01T08:00:00.000Z',
    completedAt: '2026-09-01T08:10:00.000Z',
    latitude: null,
    longitude: null,
    address: null,
    odometerKm: null,
    inspectionLocation: null,
    responsibleName: null,
    hasCriticalNonConformity: false,
    answers: [],
    evidence: [],
    maintenances: [],
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:10:00.000Z',
    ...overrides,
  };
}

describe('ChecklistsPage (Fase 111)', () => {
  beforeEach(() => {
    listChecklistExecutionsMock.mockReset();
    pushMock.mockReset();
    listChecklistExecutionsMock.mockResolvedValue({
      items: [buildExecution()],
      meta: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    });
  });

  it('lista as execuções de checklist com status e não conformidade', async () => {
    renderPage();

    expect((await screen.findAllByText('Sider Pré-Viagem')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('ABC1D23').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Concluído').length).toBeGreaterThan(0);
  });

  it('navega para o detalhe ao clicar na linha', async () => {
    renderPage();

    const row = (await screen.findAllByText('Sider Pré-Viagem'))[0]!.closest('tr, [role="button"], div');
    if (row) fireEvent.click(row);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/checklists/exec-1'));
  });

  it('filtra por status', async () => {
    renderPage();
    await screen.findAllByText('Sider Pré-Viagem');
    listChecklistExecutionsMock.mockClear();

    const statusSelect = screen.getByLabelText('Status');
    fireEvent.change(statusSelect, { target: { value: 'COMPLETED' } });

    await waitFor(() =>
      expect(listChecklistExecutionsMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'COMPLETED' }),
        expect.anything(),
      ),
    );
  });
});
