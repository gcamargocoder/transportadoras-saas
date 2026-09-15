// Central de Ajuda -- conteúdo estático versionado junto ao código (nunca
// buscado do backend: é conteúdo do produto, não dado de cliente). Ver
// docs/help-center.md para a decisão de arquitetura.

export type HelpModuleId =
  | 'primeiros-passos'
  | 'operacao'
  | 'comercial'
  | 'financeiro'
  | 'cadastros'
  | 'driver-app'
  | 'status'
  | 'alertas';

export interface HelpModuleMeta {
  id: HelpModuleId;
  label: string;
  description: string;
}

export interface HelpArticleContent {
  oQueE?: string;
  paraQueServe?: string;
  comoFazer?: string[];
  oQueAconteceDepois?: string;
  atencao?: string;
}

export interface HelpArticle {
  slug: string;
  title: string;
  module: HelpModuleId;
  summary: string;
  keywords: string[];
  content: HelpArticleContent;
  relatedSlugs?: string[];
}

// Parte 4 -- "Primeiros passos": sequência geral de uso, não é um artigo de
// pergunta/resposta como os demais. Cada passo pode apontar para o artigo
// completo correspondente (articleSlug), quando existir um.
export interface PrimeirosPassosStep {
  title: string;
  description: string;
  articleSlug?: string;
}
