import { describe, expect, it } from 'vitest';
import { HELP_MODULES } from '../modules';
import { HELP_ARTICLES, findHelpArticle } from './index';

// Parte 23 do pedido -- qualidade do conteúdo: nenhum link interno quebrado,
// nenhum slug duplicado, todo artigo pertence a um módulo real.
describe('conteúdo da Central de Ajuda', () => {
  it('não tem slugs duplicados', () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('todo artigo pertence a um módulo existente', () => {
    for (const article of HELP_ARTICLES) {
      expect(HELP_MODULES[article.module]).toBeDefined();
    }
  });

  it('todo relatedSlugs aponta para um artigo que realmente existe (nunca um link quebrado)', () => {
    for (const article of HELP_ARTICLES) {
      for (const relatedSlug of article.relatedSlugs ?? []) {
        expect(findHelpArticle(relatedSlug), `relatedSlugs inválido em "${article.slug}": "${relatedSlug}" não existe`).toBeDefined();
      }
    }
  });

  it('todo artigo tem título, resumo e pelo menos um campo de conteúdo preenchido', () => {
    for (const article of HELP_ARTICLES) {
      expect(article.title.length).toBeGreaterThan(0);
      expect(article.summary.length).toBeGreaterThan(0);
      const hasContent =
        article.content.oQueE ||
        article.content.paraQueServe ||
        (article.content.comoFazer && article.content.comoFazer.length > 0) ||
        article.content.oQueAconteceDepois;
      expect(Boolean(hasContent), `artigo "${article.slug}" sem conteúdo`).toBe(true);
    }
  });

  it('findHelpArticle encontra um artigo existente e retorna undefined para um slug inexistente', () => {
    expect(findHelpArticle('ciclo-de-vida-da-viagem')).toBeDefined();
    expect(findHelpArticle('slug-que-nao-existe')).toBeUndefined();
  });
});
