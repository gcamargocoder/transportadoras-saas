'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from './button';
import { Drawer } from './drawer';

export function FilterBar({
  children,
  onClear,
  hasActiveFilters,
}: {
  children: ReactNode;
  onClear?: () => void;
  hasActiveFilters?: boolean;
}): JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="mb-4">
      <div className="hidden flex-wrap items-end gap-3 md:flex">
        {children}
        {hasActiveFilters && onClear && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X size={14} />
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="md:hidden">
        <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
          <SlidersHorizontal size={14} />
          Filtros
          {hasActiveFilters && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-brand-600" />}
        </Button>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Filtros">
        <div className="flex flex-col gap-4 p-4">
          {children}
          <div className="flex gap-2 pt-2">
            {hasActiveFilters && onClear && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  onClear();
                  setDrawerOpen(false);
                }}
              >
                Limpar
              </Button>
            )}
            <Button className="flex-1" onClick={() => setDrawerOpen(false)}>
              Aplicar
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
