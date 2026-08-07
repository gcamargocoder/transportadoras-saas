import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '../../types/api';
import { Button } from './button';

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}): JSX.Element | null {
  if (meta.total === 0) return null;

  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <div className="flex flex-col items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-ink-muted sm:flex-row">
      <span>
        Mostrando{' '}
        <span className="font-medium text-ink">
          {from}-{to}
        </span>{' '}
        de <span className="font-medium text-ink">{meta.total}</span>
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
          aria-label="Pagina anterior"
        >
          <ChevronLeft size={14} />
        </Button>
        <span className="px-1.5">
          Pagina {meta.page} de {Math.max(meta.totalPages, 1)}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
          aria-label="Proxima pagina"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
