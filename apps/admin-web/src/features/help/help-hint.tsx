'use client';

import { CircleHelp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import { findHelpArticle } from './content/index';

// Parte 6 do pedido -- ajuda contextual. Mesmo padrão visual/de interação
// do Dropdown já existente (painel posicionado, fecha ao clicar fora):
// nenhum componente de popover novo foi introduzido no design system, só
// reaproveitado o mesmo comportamento. Nunca renderiza nada para um slug
// que não existe -- evita link de ajuda quebrado (Parte 23).
export function HelpHint({ articleSlug, label = 'Entenda' }: { articleSlug: string; label?: string }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const article = findHelpArticle(articleSlug);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (!article) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label} ${article.title}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-ink-subtle hover:text-brand-700"
      >
        <CircleHelp size={14} />
        {label}
      </button>
      {open && (
        <div
          role="dialog"
          className={cn(
            'absolute z-20 mt-1.5 w-64 rounded-md border border-border bg-white p-3 text-left shadow-popover animate-fade-in',
          )}
        >
          <p className="text-xs font-semibold text-ink">{article.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{article.summary}</p>
          <Link
            href={`/help/${article.slug}`}
            className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline"
          >
            Ver artigo completo
          </Link>
        </div>
      )}
    </div>
  );
}
