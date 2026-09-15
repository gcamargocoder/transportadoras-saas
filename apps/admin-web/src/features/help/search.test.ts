import { describe, expect, it } from 'vitest';
import type { HelpArticle } from './types';
import { searchHelpArticles } from './search';

function buildArticle(overrides: Partial<HelpArticle> = {}): HelpArticle {
  return {
    slug: 'artigo-1',
    title: 'Como funciona uma viagem',
    module: 'operacao',
    summary: 'Entenda o ciclo de vida de uma viagem.',
    keywords: ['viagem', 'status', 'trip'],
    content: { oQueE: 'Uma viagem representa uma operação de transporte.' },
    ...overrides,
  };
}

describe('searchHelpArticles', () => {
  it('sem termo de busca, retorna a lista vazia (a home mostra categorias, não uma busca vazia)', () => {
    const articles = [buildArticle()];
    expect(searchHelpArticles('', articles)).toEqual([]);
    expect(searchHelpArticles('   ', articles)).toEqual([]);
  });

  it('encontra por título (case-insensitive, sem acento sensível)', () => {
    const articles = [buildArticle()];
    expect(searchHelpArticles('viagem', articles)).toHaveLength(1);
    expect(searchHelpArticles('VIAGEM', articles)).toHaveLength(1);
  });

  it('encontra por palavra-chave mesmo sem aparecer no título', () => {
    const articles = [buildArticle({ title: 'Ciclo de vida da operação', keywords: ['pedágio'] })];
    expect(searchHelpArticles('pedágio', articles)).toHaveLength(1);
  });

  it('encontra por conteúdo (oQueE/paraQueServe/comoFazer)', () => {
    const articles = [
      buildArticle({
        title: 'Documentos da frota',
        keywords: [],
        content: { paraQueServe: 'Evitar que o CRLV ou a CNH vençam sem ninguém perceber.' },
      }),
    ];
    expect(searchHelpArticles('CNH', articles)).toHaveLength(1);
  });

  it('não encontra artigo sem nenhuma correspondência', () => {
    const articles = [buildArticle()];
    expect(searchHelpArticles('conciliação bancária', articles)).toEqual([]);
  });

  it('resultados com match no título vêm antes de resultados só por keyword/conteúdo', () => {
    const byKeyword = buildArticle({ slug: 'por-keyword', title: 'Outra coisa qualquer', keywords: ['pedágio'] });
    const byTitle = buildArticle({ slug: 'por-titulo', title: 'Como funciona o pedágio' });
    const results = searchHelpArticles('pedágio', [byKeyword, byTitle]);
    expect(results.map((a) => a.slug)).toEqual(['por-titulo', 'por-keyword']);
  });

  it('múltiplos artigos relevantes são todos retornados', () => {
    const articles = [
      buildArticle({ slug: 'a', title: 'Como funciona o pedágio' }),
      buildArticle({ slug: 'b', title: 'Como conferir uma cobrança de pedágio' }),
      buildArticle({ slug: 'c', title: 'Como cadastrar um cliente' }),
    ];
    const results = searchHelpArticles('pedágio', articles);
    expect(results.map((a) => a.slug).sort()).toEqual(['a', 'b']);
  });
});
