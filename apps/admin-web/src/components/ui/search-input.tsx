'use client';

import { Search, X } from 'lucide-react';
import { Input } from './input';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar...',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}): JSX.Element {
  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      leadingIcon={<Search size={14} />}
      trailingIcon={
        value ? (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => onChange('')}
            className="pointer-events-auto"
          >
            <X size={14} />
          </button>
        ) : undefined
      }
      className={className}
    />
  );
}
