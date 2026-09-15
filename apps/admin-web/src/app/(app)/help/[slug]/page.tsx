'use client';

import { notFound } from 'next/navigation';
import { ArticleView } from '../../../../features/help/article-view';
import { findHelpArticle } from '../../../../features/help/content/index';
import { PageHeader } from '../../../../components/ui/page-header';

export default function HelpArticlePage({ params }: { params: { slug: string } }): JSX.Element | null {
  const article = findHelpArticle(params.slug);
  if (!article) {
    notFound();
    return null;
  }

  return (
    <div>
      <PageHeader title={article.title} description={article.summary} breadcrumb={[{ label: 'Central de Ajuda', href: '/help' }]} />
      <ArticleView article={article} />
    </div>
  );
}
