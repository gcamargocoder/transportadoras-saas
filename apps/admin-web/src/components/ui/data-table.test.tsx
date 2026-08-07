import { render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './data-table';

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row, unknown>[] = [{ header: 'Nome', accessorFn: (row) => row.name }];

describe('DataTable', () => {
  it('mostra o esqueleto de carregamento quando isLoading', () => {
    const { container } = render(
      <DataTable columns={columns} data={[]} isLoading getRowId={(r) => r.id} />,
    );
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('mostra o estado de erro com botão de tentar novamente', () => {
    const onRetry = vi.fn();
    render(
      <DataTable columns={columns} data={[]} isError onRetry={onRetry} getRowId={(r) => r.id} />,
    );
    expect(screen.getByText(/não foi possível carregar/i)).toBeInTheDocument();
    screen.getByRole('button', { name: /tentar novamente/i }).click();
    expect(onRetry).toHaveBeenCalled();
  });

  it('mostra estado vazio customizado quando não há dados', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        getRowId={(r) => r.id}
        emptyTitle="Nenhuma viagem encontrada"
        emptyDescription="Não existem viagens para os filtros selecionados."
      />,
    );
    expect(screen.getByText('Nenhuma viagem encontrada')).toBeInTheDocument();
    expect(
      screen.getByText('Não existem viagens para os filtros selecionados.'),
    ).toBeInTheDocument();
  });

  it('renderiza as linhas de dados', () => {
    render(
      <DataTable
        columns={columns}
        data={[
          { id: '1', name: 'Viagem A' },
          { id: '2', name: 'Viagem B' },
        ]}
        getRowId={(r) => r.id}
      />,
    );
    expect(screen.getAllByText('Viagem A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Viagem B').length).toBeGreaterThan(0);
  });
});
