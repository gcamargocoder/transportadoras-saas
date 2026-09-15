import { describe, expect, it } from 'vitest';
import { findHelpArticle } from './content/index';
import { PRIMEIROS_PASSOS_STEPS } from './primeiros-passos';

describe('Primeiros passos', () => {
  it('tem pelo menos um passo', () => {
    expect(PRIMEIROS_PASSOS_STEPS.length).toBeGreaterThan(0);
  });

  it('todo articleSlug de um passo aponta para um artigo que realmente existe', () => {
    for (const step of PRIMEIROS_PASSOS_STEPS) {
      if (!step.articleSlug) continue;
      expect(findHelpArticle(step.articleSlug), `passo "${step.title}" aponta para um artigo inexistente: "${step.articleSlug}"`).toBeDefined();
    }
  });
});
