'use client';

import { AlertTriangle } from 'lucide-react';
import { SearchCombobox } from '../../components/ui/search-combobox';
import { listTollPlazas } from '../../lib/api/tolls.api';
import type { TollPlazaEntity } from '../../types/entities';
import { formatCurrency } from '../../utils/format';

const PAGE_SIZE = 20;

// TollPlaza e dado GLOBAL de referencia com 191+ registros no ambiente de
// desenvolvimento -- um <select> com pageSize fixo (100) esconderia
// silenciosamente as pracas fora da primeira pagina. Busca real evita isso.
export function PlazaPicker({
  id,
  selectedPlaza,
  onSelect,
  onClear,
  invalid,
  disabled,
}: {
  id?: string;
  selectedPlaza: TollPlazaEntity | null;
  onSelect: (plaza: TollPlazaEntity) => void;
  onClear: () => void;
  invalid?: boolean;
  disabled?: boolean;
}): JSX.Element {
  return (
    <SearchCombobox<TollPlazaEntity>
      id={id}
      selectedItem={selectedPlaza}
      onSelect={onSelect}
      onClear={onClear}
      invalid={invalid}
      disabled={disabled}
      placeholder="Buscar por nome, rodovia, cidade..."
      emptyLabel="Nenhuma praça encontrada."
      queryKey={(search) => ['toll-plazas', 'picker', search]}
      queryFn={async (search) =>
        listTollPlazas({ search: search || undefined, pageSize: PAGE_SIZE })
      }
      getOptionValue={(plaza) => plaza.id}
      getDisplayText={(plaza) => `${plaza.name}${plaza.highway ? ` · ${plaza.highway}` : ''}`}
      renderOption={(plaza) => (
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-ink">{plaza.name}</p>
            {plaza.pricePerAxle === null ? (
              <span className="flex items-center gap-1 text-xs text-warning-600">
                <AlertTriangle size={12} />
                Sem tarifa
              </span>
            ) : (
              <span className="text-xs text-ink-subtle">
                {formatCurrency(plaza.pricePerAxle)}/eixo
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {plaza.operator}
            {plaza.highway ? ` · ${plaza.highway}` : ''}
            {plaza.city ? ` · ${plaza.city}/${plaza.state ?? ''}` : ''}
          </p>
        </div>
      )}
    />
  );
}
