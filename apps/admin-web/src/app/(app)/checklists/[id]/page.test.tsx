import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../../components/ui/toast';
import type { ChecklistExecutionEntity } from '../../../../types/entities';
import ChecklistExecutionDetailPage from './page';

const getChecklistExecutionMock = vi.fn();
const createMaintenanceMock = vi.fn();
const useAuthMock = vi.fn();
const pushMock = vi.fn();

vi.mock('../../../../lib/api/checklist.api', () => ({
  getChecklistExecution: (...args: unknown[]) => getChecklistExecutionMock(...args),
}));

vi.mock('../../../../lib/api/fleet.api', () => ({
  createMaintenance: (...args: unknown[]) => createMaintenanceMock(...args),
  listVehicles: () =>
    Promise.resolve({ items: [{ id: '11111111-1111-4111-8111-111111111111', plate: 'ABC1D23', brand: 'Volvo', model: 'FH 540' }] }),
}));

vi.mock('../../../../lib/api/maintenance-providers.api', () => ({
  listMaintenanceProviders: () => Promise.resolve({ items: [] }),
}));

vi.mock('../../../../hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'exec-1' }),
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
  return render(<ChecklistExecutionDetailPage />, { wrapper: Wrapper });
}

function buildExecution(overrides: Partial<ChecklistExecutionEntity> = {}): ChecklistExecutionEntity {
  return {
    id: 'exec-1',
    tenantId: 't1',
    templateId: 'template-1',
    templateVersion: 1,
    templateName: 'Sider Pré-Viagem',
    templateType: 'PRE_TRIP',
    tripId: 'trip-1',
    tripDestinationName: 'São Paulo/SP',
    driverId: 'driver-1',
    driverName: 'José da Silva',
    vehicleId: '11111111-1111-4111-8111-111111111111',
    vehiclePlate: 'ABC1D23',
    trailerId: null,
    status: 'COMPLETED',
    startedAt: '2026-09-01T08:00:00.000Z',
    completedAt: '2026-09-01T08:10:00.000Z',
    latitude: null,
    longitude: null,
    address: null,
    odometerKm: 100000,
    inspectionLocation: 'Pátio Central',
    responsibleName: 'José da Silva',
    hasCriticalNonConformity: false,
    answers: [
      {
        id: 'answer-1',
        executionId: 'exec-1',
        itemId: 'item-1',
        itemCode: 'cinto_seguranca',
        itemLabel: 'Cinto de segurança OK?',
        itemType: 'BOOLEAN',
        itemRequired: true,
        itemCritical: true,
        booleanValue: true,
        textValue: null,
        numberValue: null,
        selectedValue: null,
        evidence: [],
        createdAt: '2026-09-01T08:05:00.000Z',
        updatedAt: '2026-09-01T08:05:00.000Z',
      },
    ],
    evidence: [],
    maintenances: [],
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:10:00.000Z',
    ...overrides,
  };
}

describe('ChecklistExecutionDetailPage (Fase 111)', () => {
  beforeEach(() => {
    getChecklistExecutionMock.mockReset();
    createMaintenanceMock.mockReset();
    pushMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: 'ADMIN' } });
  });

  it('mostra identificação, respostas e status do checklist', async () => {
    getChecklistExecutionMock.mockResolvedValue(buildExecution());
    renderPage();

    expect((await screen.findAllByText('Sider Pré-Viagem')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('ABC1D23').length).toBeGreaterThan(0);
    expect(screen.getByText('Cinto de segurança OK?')).toBeInTheDocument();
    expect(screen.getByText('Sim')).toBeInTheDocument();
    expect(screen.getByText('Crítico')).toBeInTheDocument();
    expect(screen.getByText('Sem não conformidade crítica')).toBeInTheDocument();
  });

  it('nao mostra o botao "Abrir OS" quando nao ha nao-conformidade critica', async () => {
    getChecklistExecutionMock.mockResolvedValue(buildExecution({ hasCriticalNonConformity: false }));
    renderPage();

    await screen.findAllByText('Sider Pré-Viagem');
    expect(screen.queryByText('Abrir OS a partir desta não conformidade')).toBeNull();
  });

  it('mostra o botao "Abrir OS" quando ha nao-conformidade critica, e cria a OS vinculada ao checklist', async () => {
    getChecklistExecutionMock.mockResolvedValue(
      buildExecution({
        hasCriticalNonConformity: true,
        answers: [
          {
            id: 'answer-1',
            executionId: 'exec-1',
            itemId: 'item-1',
            itemCode: 'freio',
            itemLabel: 'Freio OK?',
            itemType: 'BOOLEAN',
            itemRequired: true,
            itemCritical: true,
            booleanValue: false,
            textValue: null,
            numberValue: null,
            selectedValue: null,
            evidence: [],
            createdAt: '2026-09-01T08:05:00.000Z',
            updatedAt: '2026-09-01T08:05:00.000Z',
          },
        ],
      }),
    );
    createMaintenanceMock.mockResolvedValue({ id: 'maint-1' });
    renderPage();

    const openButton = await screen.findByText('Abrir OS a partir desta não conformidade');
    fireEvent.click(openButton);

    const confirmButton = await screen.findByText('Registrar');
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(createMaintenanceMock).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicleId: '11111111-1111-4111-8111-111111111111',
          checklistExecutionId: 'exec-1',
        }),
      ),
    );
  });

  it('mostra a lista de OS ja abertas a partir deste checklist', async () => {
    getChecklistExecutionMock.mockResolvedValue(
      buildExecution({
        hasCriticalNonConformity: true,
        maintenances: [{ id: 'maint-1', serviceOrderNumber: 'OS-2026-001', status: 'OPEN' }],
      }),
    );
    renderPage();

    expect(await screen.findByText('OS-2026-001')).toBeInTheDocument();
  });
});
