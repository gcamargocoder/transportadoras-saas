import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { HELP_MODULES } from './modules';
import type { HelpArticle } from './types';

export function ArticleCard({ article }: { article: HelpArticle }): JSX.Element {
  return (
    <Link
      href={`/help/${article.slug}`}
      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3.5 text-left shadow-xs transition-colors hover:border-brand-300 hover:bg-brand-50/40"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{article.title}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{article.summary}</p>
        <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
          {HELP_MODULES[article.module].label}
        </p>
      </div>
      <ChevronRight size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
    </Link>
  );
}
