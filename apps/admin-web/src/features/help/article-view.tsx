import Link from 'next/link';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import type { HelpArticle } from './types';
import { findHelpArticle } from './content/index';

export function ArticleView({ article }: { article: HelpArticle }): JSX.Element {
  const { content } = article;
  const related = (article.relatedSlugs ?? []).map((slug) => findHelpArticle(slug)).filter((a): a is HelpArticle => Boolean(a));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-5">
          {content.oQueE && (
            <section>
              <h2 className="text-sm font-semibold text-ink">O que é?</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{content.oQueE}</p>
            </section>
          )}
          {content.paraQueServe && (
            <section>
              <h2 className="text-sm font-semibold text-ink">Para que serve?</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{content.paraQueServe}</p>
            </section>
          )}
          {content.comoFazer && content.comoFazer.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-ink">Como fazer?</h2>
              <ol className="mt-1 flex flex-col gap-1.5 text-sm leading-relaxed text-ink-muted">
                {content.comoFazer.map((step, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="shrink-0 font-medium text-ink-subtle">{index + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {content.oQueAconteceDepois && (
            <section>
              <h2 className="text-sm font-semibold text-ink">O que acontece depois?</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{content.oQueAconteceDepois}</p>
            </section>
          )}
          {content.atencao && (
            <section className="rounded-md border border-warning-200 bg-warning-50 px-3.5 py-3">
              <h2 className="text-sm font-semibold text-warning-800">Atenção</h2>
              <p className="mt-1 text-sm leading-relaxed text-warning-700">{content.atencao}</p>
            </section>
          )}
        </CardBody>
      </Card>

      {related.length > 0 && (
        <Card>
          <CardHeader title="Veja também" className="px-5 py-3.5" />
          <CardBody className="flex flex-col gap-2 pt-0">
            {related.map((item) => (
              <Link key={item.slug} href={`/help/${item.slug}`} className="text-sm text-brand-700 hover:underline">
                {item.title}
              </Link>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
