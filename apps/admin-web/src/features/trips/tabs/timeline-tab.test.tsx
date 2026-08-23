import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripTimelineEventEntity } from '../../../types/entities';
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

const EVENTS: TripTimelineEventEntity[] = [
  {
    id: 'log-1',
    origin: 'AUDIT',
    type: 'trip.started',
    label: 'Viagem iniciada',
    description: null,
    severity: null,
    occurredAt: '2026-09-01T08:00:00.000Z',
  },
  {
    id: 'stop-1',
    origin: 'STOP',
    type: 'REST',
    label: 'Parada operacional',
    description: 'Posto Ipiranga km 120',
    severity: null,
    occurredAt: '2026-09-01T09:00:00.000Z',
  },
  {
    id: 'occ-1',
    origin: 'OCCURRENCE',
    type: 'BREAKDOWN',
    label: 'Ocorrência: BREAKDOWN',
    description: 'Pane no motor (Em aberto)',
    severity: 'CRITICAL',
    occurredAt: '2026-09-01T10:00:00.000Z',
  },
];

// Fase 67 -- a timeline evoluiu de "so AuditLog" para uma projecao unica
// agregando varias origens (STOP/FUEL/OCCURRENCE/AUDIT/...); o rotulo e a
// severidade agora vem prontos do backend (TripTimelineService), o
// componente so exibe.
describe('TimelineTab', () => {
  beforeEach(() => {
    getTripTimelineMock.mockReset();
  });

  it('mostra estado vazio quando nao ha eventos', async () => {
    getTripTimelineMock.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pageSize: 100, totalPages: 0 } });
    renderTab();

    expect(await screen.findByText(/Nenhum evento registrado/i)).toBeInTheDocument();
  });

  it('renderiza eventos de multiplas origens com rotulo e badges', async () => {
    getTripTimelineMock.mockResolvedValue({
      items: EVENTS,
      meta: { total: EVENTS.length, page: 1, pageSize: 100, totalPages: 1 },
    });
    renderTab();

    expect(await screen.findByText('Viagem iniciada')).toBeInTheDocument();
    expect(screen.getByText('Parada operacional')).toBeInTheDocument();
    expect(screen.getByText('Posto Ipiranga km 120')).toBeInTheDocument();
    expect(screen.getByText('Ocorrência: BREAKDOWN')).toBeInTheDocument();
    expect(screen.getByText('Crítica')).toBeInTheDocument();
  });
});
