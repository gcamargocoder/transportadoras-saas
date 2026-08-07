'use client';

import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'right',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  side?: 'left' | 'right';
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-ink/40 animate-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex h-full w-full max-w-sm flex-col bg-white shadow-lg animate-slide-in-right ${
          side === 'left' ? 'mr-auto' : 'ml-auto'
        }`}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="rounded-md p-1 text-ink-subtle hover:bg-surface-muted hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="scrollbar-thin flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
