'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useDebounce } from '../../hooks/use-debounce';
import { cn } from '../../utils/cn';

// Combo com busca assincrona real (debounced), para selecionar 1 registro
// entre um volume potencialmente grande (ex: viagens) sem carregar tudo de
// uma vez -- diferente do EntitySelect (que pre-carrega ate 100 itens num
// <select> nativo, adequado para listas pequenas/estaveis como motoristas).
export function SearchCombobox<T>({
  queryKey,
  queryFn,
  getOptionValue,
  renderOption,
  getDisplayText,
  selectedItem,
  onSelect,
  onClear,
  placeholder = 'Buscar...',
  emptyLabel = 'Nenhum resultado encontrado.',
  invalid,
  disabled,
  id,
  minChars = 0,
}: {
  queryKey: (search: string) => unknown[];
  queryFn: (search: string) => Promise<{ items: T[] }>;
  getOptionValue: (item: T) => string;
  renderOption: (item: T) => React.ReactNode;
  getDisplayText: (item: T) => string;
  selectedItem: T | null;
  onSelect: (item: T) => void;
  onClear: () => void;
  placeholder?: string | undefined;
  emptyLabel?: string | undefined;
  invalid?: boolean | undefined;
  disabled?: boolean | undefined;
  id?: string | undefined;
  minChars?: number | undefined;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: queryKey(debouncedSearch),
    queryFn: () => queryFn(debouncedSearch),
    enabled: open && debouncedSearch.length >= minChars,
  });

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (selectedItem && !open) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border-strong bg-white px-3 py-2 text-sm">
        <Check size={14} className="shrink-0 text-success-600" />
        <span className="min-w-0 flex-1 truncate text-ink">{getDisplayText(selectedItem)}</span>
        {!disabled && (
          <button
            type="button"
            aria-label="Trocar selecao"
            onClick={() => {
              onClear();
              setSearch('');
              setOpen(true);
            }}
            className="shrink-0 rounded p-0.5 text-ink-subtle hover:bg-surface-muted hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
        />
        <input
          id={id}
          disabled={disabled}
          value={search}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className={cn(
            'h-9 w-full rounded-md border bg-white pl-9 pr-8 text-sm text-ink placeholder:text-ink-subtle',
            'transition-shadow duration-150 focus:border-brand-500',
            invalid ? 'border-danger-500' : 'border-border-strong',
            'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle',
          )}
        />
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle"
        />
      </div>

      {open && (
        <div className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-white shadow-popover">
          {debouncedSearch.length < minChars && (
            <p className="px-3 py-3 text-xs text-ink-subtle">
              Digite pelo menos {minChars} caracteres para buscar.
            </p>
          )}
          {debouncedSearch.length >= minChars && query.isLoading && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-ink-subtle">
              <Loader2 size={14} className="animate-spin" />
              Buscando...
            </div>
          )}
          {debouncedSearch.length >= minChars && query.isError && (
            <p className="px-3 py-3 text-xs text-danger-600">Erro ao buscar. Tente novamente.</p>
          )}
          {debouncedSearch.length >= minChars && query.data && query.data.items.length === 0 && (
            <p className="px-3 py-3 text-xs text-ink-subtle">{emptyLabel}</p>
          )}
          {query.data?.items.map((item) => (
            <button
              key={getOptionValue(item)}
              type="button"
              onClick={() => {
                onSelect(item);
                setOpen(false);
              }}
              className="block w-full px-3 py-2.5 text-left text-sm hover:bg-surface-muted"
            >
              {renderOption(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
