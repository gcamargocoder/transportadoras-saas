import type { HelpArticle } from '../types';
import { ALERTAS_ARTICLES } from './alertas';
import { CADASTROS_ARTICLES } from './cadastros';
import { COMERCIAL_ARTICLES } from './comercial';
import { DRIVER_APP_ARTICLES } from './driver-app';
import { FINANCEIRO_ARTICLES } from './financeiro';
import { OPERACAO_ARTICLES } from './operacao';
import { STATUS_ARTICLES } from './status';

export const HELP_ARTICLES: HelpArticle[] = [
  ...OPERACAO_ARTICLES,
  ...COMERCIAL_ARTICLES,
  ...FINANCEIRO_ARTICLES,
  ...CADASTROS_ARTICLES,
  ...DRIVER_APP_ARTICLES,
  ...STATUS_ARTICLES,
  ...ALERTAS_ARTICLES,
];

export function findHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.slug === slug);
}

export function articlesByModule(moduleId: HelpArticle['module']): HelpArticle[] {
  return HELP_ARTICLES.filter((article) => article.module === moduleId);
}
