'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArticleCard } from '../../../features/help/article-card';
import { HELP_ARTICLES } from '../../../features/help/content/index';
import { HELP_MODULE_ORDER, HELP_MODULES } from '../../../features/help/modules';
import { OnboardingModal } from '../../../features/help/onboarding-modal';
import { searchHelpArticles } from '../../../features/help/search';
import { Button } from '../../../components/ui/button';
import { Card, CardBody } from '../../../components/ui/card';
import { PageHeader } from '../../../components/ui/page-header';
import { SearchInput } from '../../../components/ui/search-input';

export default function HelpHomePage(): JSX.Element {
  const [query, setQuery] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const results = useMemo(() => searchHelpArticles(query, HELP_ARTICLES), [query]);
  const isSearching = query.trim().length > 0;

  return (
    <div>
      <PageHeader
        title="Central de Ajuda"
        description="Como podemos ajudar?"
        actions={
          <Button variant="outline" onClick={() => setShowOnboarding(true)}>
            Rever introdução
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Busque por um termo: viagem, pedágio, motorista, documento, fechamento..."
          className="max-w-xl"
        />

        {isSearching ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Resultados para "{query}"</h2>
            {results.length === 0 ? (
              <Card>
                <CardBody className="flex flex-col items-start gap-3">
                  <p className="text-sm text-ink-muted">Não encontramos uma orientação para essa dúvida.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                      Voltar para a Central
                    </Button>
                    <Link href="/help/primeiros-passos">
                      <Button variant="outline" size="sm">
                        Ver primeiros passos
                      </Button>
                    </Link>
                  </div>
                </CardBody>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {results.map((article) => (
                  <ArticleCard key={article.slug} article={article} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <Link
              href="/help/primeiros-passos"
              className="flex items-center justify-between gap-4 rounded-lg border border-brand-200 bg-brand-50 px-5 py-4 transition-colors hover:bg-brand-100"
            >
              <div>
                <p className="text-sm font-semibold text-brand-800">Primeiros passos</p>
                <p className="mt-0.5 text-xs text-brand-700">Novo por aqui? Veja a sequência geral para começar a usar o sistema.</p>
              </div>
              <Button size="sm">Começar</Button>
            </Link>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {HELP_MODULE_ORDER.filter((moduleId) => moduleId !== 'primeiros-passos').map((moduleId) => {
                const meta = HELP_MODULES[moduleId];
                const count = HELP_ARTICLES.filter((a) => a.module === moduleId).length;
                return (
                  <Card key={moduleId}>
                    <CardBody>
                      <p className="text-sm font-semibold text-ink">{meta.label}</p>
                      <p className="mt-1 text-xs text-ink-muted">{meta.description}</p>
                      <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                        {count} {count === 1 ? 'artigo' : 'artigos'}
                      </p>
                      <div className="mt-3 flex flex-col gap-1.5">
                        {HELP_ARTICLES.filter((a) => a.module === moduleId)
                          .slice(0, 4)
                          .map((article) => (
                            <Link key={article.slug} href={`/help/${article.slug}`} className="text-sm text-brand-700 hover:underline">
                              {article.title}
                            </Link>
                          ))}
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      <OnboardingModal open={showOnboarding} onDismiss={() => setShowOnboarding(false)} />
    </div>
  );
}
