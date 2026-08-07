'use client';

import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { SkeletonTable } from './skeleton';

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  renderMobileCard?: (row: T) => ReactNode;
  getRowId?: (row: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  isError,
  onRetry,
  emptyTitle = 'Nenhum registro encontrado.',
  emptyDescription,
  emptyAction,
  onRowClick,
  renderMobileCard,
  getRowId,
}: DataTableProps<T>): JSX.Element {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(getRowId ? { getRowId: (row: T) => getRowId(row) } : {}),
  });

  if (isLoading) return <SkeletonTable columns={columns.length} />;
  if (isError) return <ErrorState {...(onRetry ? { onRetry } : {})} />;
  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <>
      <div className="scrollbar-thin hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-medium text-ink-muted"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(
                  'border-b border-border last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-surface-subtle',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 align-middle text-ink">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 p-2 md:hidden">
        {table.getRowModel().rows.map((row) => (
          <div
            key={row.id}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            className={cn(
              'rounded-lg border border-border bg-white p-3.5',
              onRowClick && 'cursor-pointer active:bg-surface-subtle',
            )}
          >
            {renderMobileCard ? (
              renderMobileCard(row.original)
            ) : (
              <div className="flex flex-col gap-1.5">
                {row.getVisibleCells().map((cell) => {
                  const header = cell.column.columnDef.header;
                  const headerText = typeof header === 'string' ? header : undefined;
                  return (
                    <div key={cell.id} className="flex items-center justify-between gap-3 text-xs">
                      {headerText && <span className="shrink-0 text-ink-subtle">{headerText}</span>}
                      <span className="truncate text-right font-medium text-ink">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
