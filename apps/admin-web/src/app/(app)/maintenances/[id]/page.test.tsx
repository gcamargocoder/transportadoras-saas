import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../../components/ui/toast';
import type { MaintenanceEntity } from '../../../../types/entities';
import MaintenanceDetailPage from './page';

const getMaintenanceMock = vi.fn();
const getMaintenanceHistoryMock = vi.fn();
const diagnoseMaintenanceMock = vi.fn();
const submitMaintenanceForApprovalMock = vi.fn();
const approveMaintenanceMock = vi.fn();
const startMaintenanceMock = vi.fn();
const completeMaintenanceMock = vi.fn();
const cancelMaintenanceMock = vi.fn();
const useAuthMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../../lib/api/fleet.api', () => ({
  getMaintenance: (...args: unknown[]) => getMaintenanceMock(...args),
  getMaintenanceHistory: (...args: unknown[]) => getMaintenanceHistoryMock(...args),
  diagnoseMaintenance: (...args: unknown[]) => diagnoseMaintenanceMock(...args),
  submitMaintenanceForApproval: (...args: unknown[]) => submitMaintenanceForApprovalMock(...args),
  approveMaintenance: (...args: unknown[]) => approveMaintenanceMock(...args),
  startMaintenance: (...args: unknown[]) => startMaintenanceMock(...args),
  completeMaintenance: (...args: unknown[]) => completeMaintenanceMock(...args),
  cancelMaintenance: (...args: unknown[]) => cancelMaintenanceMock(...args),
}));

vi.mock('../../../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'maint-1' }),
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
  return render(<MaintenanceDetailPage />, { wrapper: Wrapper });
}

function buildMaintenance(overrides: Partial<MaintenanceEntity> = {}): MaintenanceEntity {
  return {
    id: 'maint-1',
    tenantId: 't1',
    vehicleId: 'v1',
    vehiclePlate: 'ABC1D23',
    type: 'CORRECTIVE',
    status: 'OPEN',
    priority: 'HIGH',
    openedAt: '2026-09-01T08:00:00.000Z',
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    diagnosis: null,
    odometerKm: 125000,
    completionOdometerKm: null,
    workshop: 'Oficina Central',
    supplier: null,
    mechanic: null,
    workshopId: null,
    workshopName: null,
    supplierId: null,
    supplierName: null,
    responsibleUserId: null,
    description: 'Ruído no motor.',
    notes: null,
    laborCost: null,
    partsCost: null,
    totalCost: null,
    serviceOrderNumber: 'OS-2026-001',
    warrantyUntil: null,
    nextReviewAt: null,
    component: null,
    nextOdometerKm: null,
    downtimeMinutes: null,
    invoiceNumber: null,
    maintenancePlanId: null,
    parts: [],
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('MaintenanceDetailPage (Fase 82)', () => {
  beforeEach(() => {
    getMaintenanceMock.mockReset();
    getMaintenanceHistoryMock.mockReset();
    diagnoseMaintenanceMock.mockReset();
    submitMaintenanceForApprovalMock.mockReset();
    approveMaintenanceMock.mockReset();
    startMaintenanceMock.mockReset();
    completeMaintenanceMock.mockReset();
    cancelMaintenanceMock.mockReset();
    pushMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
    getMaintenanceHistoryMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 50, totalPages: 0 } });
  });

  it('mostra identificação, problema e placa do veículo', async () => {
    getMaintenanceMock.mockResolvedValue(buildMaintenance());
    renderPage();

    expect((await screen.findAllByText('OS-2026-001')).length).toBeGreaterThan(0);
    expect(screen.getByText('Ruído no motor.')).toBeInTheDocument();
    expect(screen.getAllByText('ABC1D23').length).toBeGreaterThan(0);
  });

  it('OS OPEN: mostra "Iniciar diagnóstico", nao mostra "Aprovar"', async () => {
    getMaintenanceMock.mockResolvedValue(buildMaintenance({ status: 'OPEN' }));
    renderPage();

    expect(await screen.findByText('Iniciar diagnóstico')).toBeInTheDocument();
    expect(screen.queryByText('Aprovar')).toBeNull();
  });

  it('OS AWAITING_APPROVAL: mostra "Aprovar", nao mostra "Iniciar diagnóstico"', async () => {
    getMaintenanceMock.mockResolvedValue(buildMaintenance({ status: 'AWAITING_APPROVAL' }));
    renderPage();

    expect(await screen.findByText('Aprovar')).toBeInTheDocument();
    expect(screen.queryByText('Iniciar diagnóstico')).toBeNull();
  });

  it('OS COMPLETED: nenhuma acao de escrita disponivel', async () => {
    getMaintenanceMock.mockResolvedValue(buildMaintenance({ status: 'COMPLETED', completedAt: '2026-09-05T10:00:00.000Z' }));
    renderPage();

    await screen.findAllByText('OS-2026-001');
    expect(screen.queryByText('Iniciar diagnóstico')).toBeNull();
    expect(screen.queryByText('Concluir')).toBeNull();
    expect(screen.queryByText('Cancelar')).toBeNull();
  });

  it('aciona diagnoseMaintenance ao confirmar o modal de diagnostico', async () => {
    getMaintenanceMock.mockResolvedValue(buildMaintenance({ status: 'OPEN' }));
    diagnoseMaintenanceMock.mockResolvedValue(buildMaintenance({ status: 'DIAGNOSING', diagnosis: 'Correia solta.' }));
    renderPage();

    fireEvent.click(await screen.findByText('Iniciar diagnóstico'));
    fireEvent.change(screen.getByLabelText('Diagnóstico técnico', { exact: false }), { target: { value: 'Correia solta.' } });
    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => expect(diagnoseMaintenanceMock).toHaveBeenCalledWith('maint-1', 'Correia solta.'));
  });

  it('aba Histórico lista eventos de auditoria', async () => {
    getMaintenanceMock.mockResolvedValue(buildMaintenance());
    getMaintenanceHistoryMock.mockResolvedValue({
      items: [
        {
          id: 'a1',
          tenantId: 't1',
          userId: 'u1',
          action: 'maintenance.created',
          entityName: 'VehicleMaintenance',
          entityId: 'maint-1',
          previousValue: null,
          newValue: null,
          ipAddress: null,
          userAgent: null,
          createdAt: '2026-09-01T08:00:00.000Z',
        },
      ],
      meta: { total: 1, page: 1, pageSize: 50, totalPages: 1 },
    });
    renderPage();

    await screen.findAllByText('OS-2026-001');
    fireEvent.click(screen.getByText('Histórico'));

    expect(await screen.findByText('maintenance.created')).toBeInTheDocument();
  });
});
