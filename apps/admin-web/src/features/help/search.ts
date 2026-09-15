import type { HelpArticle } from './types';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function flattenContent(article: HelpArticle): string {
  const { content } = article;
  return [content.oQueE, content.paraQueServe, ...(content.comoFazer ?? []), content.oQueAconteceDepois, content.atencao]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

// Busca client-side simples (Parte 20): sem Elasticsearch, sem backend.
// Ranking: título > palavra-chave > conteúdo -- para que "pedágio" priorize
// o artigo "Como funciona o pedágio" sobre um artigo que só menciona
// pedágio de passagem no corpo do texto.
export function searchHelpArticles(query: string, articles: HelpArticle[]): HelpArticle[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const scored = articles
    .map((article) => {
      const title = normalize(article.title);
      const keywords = normalize(article.keywords.join(' '));
      const body = normalize(flattenContent(article));

      let score = 0;
      if (title.includes(normalizedQuery)) score += 3;
      if (keywords.includes(normalizedQuery)) score += 2;
      if (body.includes(normalizedQuery)) score += 1;

      return { article, score };
    })
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.article);
}
