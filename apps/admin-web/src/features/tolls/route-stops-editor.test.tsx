import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/ui/toast';
import type { TollRouteEntity } from '../../types/entities';
import { RouteStopsEditor } from './route-stops-editor';

const replaceTollRouteStopsMock = vi.fn();

vi.mock('../../lib/api/toll-routes.api', () => ({
  replaceTollRouteStops: (id: string, tollPlazaIds: string[]) =>
    replaceTollRouteStopsMock(id, tollPlazaIds),
}));

vi.mock('./plaza-picker', () => ({
  PlazaPicker: ({ onSelect }: { onSelect: (plaza: { id: string; name: string }) => void }) => (
    <button onClick={() => onSelect({ id: 'plaza-new', name: 'Praça Nova' })}>
      selecionar praça nova
    </button>
  ),
}));

const ROUTE: TollRouteEntity = {
  id: 'route-1',
  tenantId: 'tenant-1',
  name: 'São José do Rio Preto → São Paulo',
  originLabel: 'São José do Rio Preto',
  destinationLabel: 'São Paulo',
  isActive: true,
  stops: [
    {
      sequence: 1,
      tollPlazaId: 'plaza-a',
      tollPlazaName: 'Praça A',
      highway: 'SP-310',
      pricePerAxle: 15,
    },
    {
      sequence: 2,
      tollPlazaId: 'plaza-b',
      tollPlazaName: 'Praça B',
      highway: 'SP-310',
      pricePerAxle: null,
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderEditor(canEdit: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ToastProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    );
  }
  return render(<RouteStopsEditor route={ROUTE} canEdit={canEdit} />, { wrapper: Wrapper });
}

describe('RouteStopsEditor', () => {
  afterEach(() => {
    replaceTollRouteStopsMock.mockClear();
  });

  it('exibe ORIGEM → praças em ordem → DESTINO', () => {
    renderEditor(true);
    expect(screen.getByText(/ORIGEM · São José do Rio Preto/)).toBeInTheDocument();
    expect(screen.getByText(/DESTINO · São Paulo/)).toBeInTheDocument();
    expect(screen.getByText(/1\. Praça A/)).toBeInTheDocument();
    expect(screen.getByText(/2\. Praça B/)).toBeInTheDocument();
  });

  it('indica quando uma praça não tem tarifa cadastrada', () => {
    renderEditor(true);
    expect(screen.getByText(/sem tarifa cadastrada/i)).toBeInTheDocument();
  });

  it('não mostra ações de edição (mover/remover/adicionar) quando canEdit é false', () => {
    renderEditor(false);
    expect(screen.queryByLabelText('Remover praça da rota')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mover praça para cima')).not.toBeInTheDocument();
    expect(screen.queryByText('selecionar praça nova')).not.toBeInTheDocument();
  });

  it('remover uma praça envia a lista restante, na mesma ordem', async () => {
    renderEditor(true);

    const removeButtons = screen.getAllByLabelText('Remover praça da rota');
    fireEvent.click(removeButtons[0] as HTMLElement);

    await waitFor(() =>
      expect(replaceTollRouteStopsMock).toHaveBeenCalledWith('route-1', ['plaza-b']),
    );
  });

  it('mover a segunda praça para cima troca a ordem enviada', async () => {
    renderEditor(true);

    const upButtons = screen.getAllByLabelText('Mover praça para cima');
    // primeiro botão "subir" desabilitado (indice 0); o segundo pertence a plaza-b.
    fireEvent.click(upButtons[1] as HTMLElement);

    await waitFor(() =>
      expect(replaceTollRouteStopsMock).toHaveBeenCalledWith('route-1', ['plaza-b', 'plaza-a']),
    );
  });

  it('adicionar uma nova praça inclui no fim da lista', async () => {
    renderEditor(true);

    fireEvent.click(screen.getByText('selecionar praça nova'));

    await waitFor(() =>
      expect(replaceTollRouteStopsMock).toHaveBeenCalledWith('route-1', [
        'plaza-a',
        'plaza-b',
        'plaza-new',
      ]),
    );
  });
});
