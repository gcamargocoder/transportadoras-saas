import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FleetFilters } from './fleet-filters';

vi.mock('../../lib/api/fleet.api', () => ({
  listVehicles: () => Promise.resolve({ items: [{ id: 'v1', plate: 'ABC1D23' }] }),
  listFleets: () => Promise.resolve({ items: [{ id: 'f1', name: 'Frota SP' }] }),
}));

function renderFilters(overrides: Partial<Parameters<typeof FleetFilters>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const onStartDateChange = vi.fn();
  const onClear = vi.fn();
  render(
    <FleetFilters
      idPrefix="test"
      startDate=""
      onStartDateChange={onStartDateChange}
      endDate=""
      onEndDateChange={vi.fn()}
      vehicleId=""
      onVehicleIdChange={vi.fn()}
      fleetId=""
      onFleetIdChange={vi.fn()}
      hasActiveFilters={false}
      onClear={onClear}
      {...overrides}
    />,
    { wrapper: Wrapper },
  );
  return { onStartDateChange, onClear };
}

describe('FleetFilters', () => {
  it('renderiza os 4 campos de filtro (período, veículo, frota)', async () => {
    renderFilters();

    expect(screen.getByLabelText('De')).toBeInTheDocument();
    expect(screen.getByLabelText('Até')).toBeInTheDocument();
    expect(screen.getByLabelText('Veículo')).toBeInTheDocument();
    expect(screen.getByLabelText('Frota')).toBeInTheDocument();
  });

  it('chama onStartDateChange ao alterar a data inicial', () => {
    const { onStartDateChange } = renderFilters();

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-01' } });
    expect(onStartDateChange).toHaveBeenCalledWith('2026-09-01');
  });

  it('lista veículos e frotas carregados via EntitySelect', async () => {
    renderFilters();

    expect(await screen.findByText('ABC1D23')).toBeInTheDocument();
    expect(await screen.findByText('Frota SP')).toBeInTheDocument();
  });

  it('mostra o botão de limpar apenas quando hasActiveFilters=true e chama onClear', () => {
    const { onClear } = renderFilters({ hasActiveFilters: true, startDate: '2026-09-01' });

    const clearButton = screen.getByRole('button', { name: 'Limpar filtros' });
    fireEvent.click(clearButton);
    expect(onClear).toHaveBeenCalled();
  });
});
