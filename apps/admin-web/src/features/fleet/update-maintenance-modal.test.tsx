import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import type { MaintenanceEntity } from '../../types/entities';
import { UpdateMaintenanceModal } from './update-maintenance-modal';

const updateMaintenanceMock = vi.fn();
const listPartsMock = vi.fn();

vi.mock('../../lib/api/fleet.api', () => ({
  updateMaintenance: (...args: unknown[]) => updateMaintenanceMock(...args),
}));

vi.mock('../../lib/api/parts.api', () => ({
  listParts: (...args: unknown[]) => listPartsMock(...args),
}));

vi.mock('../../lib/api/maintenance-providers.api', () => ({
  listMaintenanceProviders: () => Promise.resolve({ items: [] }),
}));

function renderModal(maintenance: MaintenanceEntity, onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<UpdateMaintenanceModal open onClose={onClose} maintenance={maintenance} />, { wrapper: Wrapper });
}

function buildMaintenance(overrides: Partial<MaintenanceEntity> = {}): MaintenanceEntity {
  return {
    id: 'maint-1',
    tenantId: 't1',
    vehicleId: 'v1',
    vehiclePlate: 'ABC1D23',
    type: 'CORRECTIVE',
    status: 'OPEN',
    priority: 'MEDIUM',
    openedAt: '2026-09-01T00:00:00.000Z',
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    diagnosis: null,
    odometerKm: null,
    completionOdometerKm: null,
    workshop: null,
    supplier: null,
    mechanic: null,
    workshopId: null,
    workshopName: null,
    supplierId: null,
    supplierName: null,
    responsibleUserId: null,
    description: null,
    notes: null,
    laborCost: 100,
    partsCost: 50,
    totalCost: 150,
    serviceOrderNumber: null,
    warrantyUntil: null,
    nextReviewAt: null,
    component: null,
    nextOdometerKm: null,
    downtimeMinutes: null,
    invoiceNumber: null,
    maintenancePlanId: null,
    checklistExecutionId: null,
    parts: [],
    tireMovements: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

// Fase 108 -- fecha a lacuna real ja documentada em docs/parts-inventory.md:
// o backend ja aceita `parts: [{partId?, name, quantity, unitPrice}]` desde
// a Fase 83 (consome estoque automaticamente ao concluir, quando partId
// esta presente), mas nao havia NENHUMA tela que montasse esse array --
// so o campo livre "Custo de pecas (R$)" existia.
describe('UpdateMaintenanceModal -- itemizacao de peças (Fase 108)', () => {
  beforeEach(() => {
    updateMaintenanceMock.mockReset();
    listPartsMock.mockReset();
    listPartsMock.mockResolvedValue({
      items: [{ id: 'part-1', sku: 'FO-001', name: 'Filtro de óleo', unit: 'un', currentStock: 5 }],
    });
    updateMaintenanceMock.mockResolvedValue(buildMaintenance());
  });

  it('OS sem nenhuma peça itemizada: nunca envia `parts` no payload (zero regressão para quem só usa o campo livre)', async () => {
    renderModal(buildMaintenance({ partsCost: 80 }));

    fireEvent.click(await screen.findByText('Salvar alterações'));

    await waitFor(() => expect(updateMaintenanceMock).toHaveBeenCalled());
    const payload = updateMaintenanceMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.parts).toBeUndefined();
  });

  it('abre já com as peças existentes da OS pré-preenchidas', async () => {
    renderModal(
      buildMaintenance({
        parts: [{ id: 'mp-1', partId: null, name: 'Correia', quantity: 1, unitPrice: 30, totalPrice: 30 }],
      }),
    );

    expect(await screen.findByDisplayValue('Correia')).toBeInTheDocument();
  });

  it('adiciona uma peça do catálogo e envia `parts` com partId no payload', async () => {
    renderModal(buildMaintenance());

    fireEvent.click(await screen.findByText('Adicionar peça'));
    const catalogSelect = await screen.findByLabelText('Peça do catálogo');
    await waitFor(() => expect(catalogSelect.querySelector('option[value="part-1"]')).not.toBeNull());
    fireEvent.change(catalogSelect, { target: { value: 'part-1' } });

    await waitFor(() => expect(screen.getByDisplayValue('Filtro de óleo')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Salvar alterações'));

    await waitFor(() => expect(updateMaintenanceMock).toHaveBeenCalled());
    const payload = updateMaintenanceMock.mock.calls[0]![1] as { parts: Array<{ partId?: string; name: string }> };
    expect(payload.parts).toHaveLength(1);
    expect(payload.parts[0]).toMatchObject({ partId: 'part-1', name: 'Filtro de óleo' });
  });

  it('remover a última peça itemizada envia `parts: []` explicitamente (limpa a itemização)', async () => {
    renderModal(
      buildMaintenance({
        parts: [{ id: 'mp-1', partId: null, name: 'Correia', quantity: 1, unitPrice: 30, totalPrice: 30 }],
      }),
    );

    fireEvent.click(await screen.findByTitle('Remover'));
    fireEvent.click(screen.getByText('Salvar alterações'));

    await waitFor(() => expect(updateMaintenanceMock).toHaveBeenCalled());
    const payload = updateMaintenanceMock.mock.calls[0]![1] as { parts: unknown[] };
    expect(payload.parts).toEqual([]);
  });

  it('bloqueia salvar quando uma peça itemizada não tem nome', async () => {
    renderModal(buildMaintenance());

    fireEvent.click(await screen.findByText('Adicionar peça'));
    fireEvent.click(screen.getByText('Salvar alterações'));

    expect(await screen.findByText(/precisa de um nome/i)).toBeInTheDocument();
    expect(updateMaintenanceMock).not.toHaveBeenCalled();
  });

  it('desabilita o campo livre "Custo de peças" quando há itens itemizados', async () => {
    renderModal(
      buildMaintenance({
        parts: [{ id: 'mp-1', partId: null, name: 'Correia', quantity: 1, unitPrice: 30, totalPrice: 30 }],
      }),
    );

    const partsCostInput = await screen.findByLabelText('Custo de peças (R$)');
    expect(partsCostInput).toBeDisabled();
  });
});
