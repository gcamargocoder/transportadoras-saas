import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditLogEntity } from '../../../types/entities';
import { TimelineTab } from './timeline-tab';

const getTripTimelineMock = vi.fn();

vi.mock('../../../lib/api/trips.api', () => ({
  getTripTimeline: (tripId: string, params?: unknown) => getTripTimelineMock(tripId, params),
}));

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return render(<TimelineTab tripId="trip-1" />, { wrapper: Wrapper });
}

const EVENTS: AuditLogEntity[] = [
  {
    id: 'log-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    action: 'trip.started',
    entityName: 'Trip',
    entityId: 'trip-1',
    previousValue: { status: 'PLANNED' },
    newValue: { status: 'IN_PROGRESS' },
    ipAddress: null,
    userAgent: null,
    createdAt: '2026-09-01T08:00:00.000Z',
  },
  {
    id: 'log-2',
    tenantId: 'tenant-1',
    userId: 'user-1',
    action: 'trip.paused',
    entityName: 'Trip',
    entityId: 'trip-1',
    previousValue: { status: 'IN_PROGRESS' },
    newValue: { status: 'PAUSED' },
    ipAddress: null,
    userAgent: null,
    createdAt: '2026-09-01T10:00:00.000Z',
  },
];

// Regressao (Fase 28): getTripTimeline batia em /trips/:id/timeline (que
// devolve AuditLog paginado, {items, meta}) mas o componente antigo esperava
// um array bruto de RouteEventEntity (endpoint DIFERENTE) -- quebrava a aba
// em runtime assim que houvesse qualquer evento.
describe('TimelineTab', () => {
  beforeEach(() => {
    getTripTimelineMock.mockReset();
  });

  it('mostra estado vazio quando nao ha eventos', async () => {
    getTripTimelineMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 100, totalPages: 0 } });
    renderTab();

    expect(await screen.findByText(/Nenhum evento registrado/i)).toBeInTheDocument();
  });

  it('renderiza os eventos do AuditLog com rotulo em pt-BR', async () => {
    getTripTimelineMock.mockResolvedValue({
      items: EVENTS,
      meta: { total: 2, page: 1, pageSize: 100, totalPages: 1 },
    });
    renderTab();

    expect(await screen.findByText('Viagem iniciada')).toBeInTheDocument();
    expect(screen.getByText('Viagem pausada')).toBeInTheDocument();
  });

  it('usa a acao bruta como rotulo quando nao ha mapeamento conhecido', async () => {
    getTripTimelineMock.mockResolvedValue({
      items: [{ ...EVENTS[0]!, id: 'log-3', action: 'trip.something_new' }],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    renderTab();

    expect(await screen.findByText('trip.something_new')).toBeInTheDocument();
  });
});
