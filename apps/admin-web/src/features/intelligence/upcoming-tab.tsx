import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { IntelligenceTabConfig } from './intelligence-config';

// Aba ainda sem conteudo nesta fase: nenhum numero ficticio -- so o que
// vem pela frente e o atalho para as telas detalhadas que ja existem.
export function UpcomingTab({ tab }: { tab: IntelligenceTabConfig }): JSX.Element | null {
  if (!tab.upcoming) return null;
  return (
    <section className="rounded-lg border border-dashed border-border-strong bg-white px-6 py-10 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-violet-50 text-violet-700" aria-hidden>
        <Sparkles size={20} />
      </span>
      <h2 className="mt-4 text-base font-semibold text-ink">{tab.label} chega à Central no {tab.upcoming.phase}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{tab.upcoming.summary}</p>
      <div className="mt-6">
        <p className="text-xs text-ink-subtle">Enquanto isso, a análise detalhada continua disponível em:</p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {tab.upcoming.screens.map((screen) => (
            <li key={screen.href}>
              <Link
                href={screen.href}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-ink hover:border-brand-300 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                {screen.label}
                <ArrowRight size={14} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
