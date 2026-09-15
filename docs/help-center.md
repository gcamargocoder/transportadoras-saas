# Central de Ajuda e Onboarding (admin-web)

## Escopo

Camada de orientação/aprendizado dentro do produto -- nunca uma funcionalidade
de negócio nova. Todo o conteúdo foi escrito **depois** de um levantamento real
do admin-web e do driver-app (menus, rotas, status/enums, RBAC) -- nenhuma
funcionalidade foi documentada como existente sem antes ser confirmada no
código.

## 1. Onde fica

Item de navegação **"Central de Ajuda"** (`/help`), no grupo "Visão geral" do
menu, ao lado de Dashboard/Notificações (`lib/nav-config.ts`). Mesmo critério
de "Notificações": `roles: []`, sem restrição de papel nem de módulo do plano
-- qualquer usuário autenticado pode abrir (Parte 12 do pedido).

Rotas:
- `/help` -- busca + categorias + atalho para "Primeiros passos" + botão
  "Rever introdução" (reabre o onboarding).
- `/help/primeiros-passos` -- sequência geral de uso, adaptada ao fluxo real
  (não o exemplo genérico do pedido -- inclui o passo de "Composição",
  confirmado como obrigatório para criar uma viagem).
- `/help/[slug]` -- artigo individual (O que é? / Para que serve? / Como
  fazer? / O que acontece depois? / Atenção).

## 2. Conteúdo -- decisão de arquitetura (Parte 22)

**Estático, versionado junto ao código** (`apps/admin-web/src/features/help/`)
-- nunca buscado do backend. Justificativa: é conteúdo do produto (não dado de
cliente), não precisa ser editado por cliente nesta fase, e versionar junto ao
código dá revisão/consistência entre ambientes de graça (mesmo princípio já
usado pelo projeto para enums/labels). Nenhuma migration, nenhum endpoint,
nenhum CMS.

Estrutura:
- `types.ts` -- `HelpArticle`/`HelpModuleId`/`PrimeirosPassosStep`.
- `modules.ts` -- metadados das 8 categorias (primeiros-passos, operação,
  comercial, financeiro, cadastros, driver-app, status, alertas).
- `content/*.ts` -- ~40 artigos, um arquivo por categoria, agregados em
  `content/index.ts` (`HELP_ARTICLES`, `findHelpArticle`, `articlesByModule`).
- `primeiros-passos.ts` -- a sequência dedicada (Parte 4), separada dos
  artigos normais porque tem forma própria (passo a passo numerado, não
  pergunta/resposta).

Teste de integridade (`content/index.test.ts`, `primeiros-passos.test.ts`):
garante que nenhum `relatedSlugs`/`articleSlug` aponta para um artigo
inexistente (nunca um link de ajuda quebrado) e que todo artigo tem
título/resumo/conteúdo -- conferido automaticamente, não só por revisão
manual (Parte 23).

## 3. Busca (Parte 20)

Client-side, sem Elasticsearch/backend: `search.ts`,
`searchHelpArticles(query, articles)`. Ranking simples: título (peso 3) >
palavra-chave (peso 2) > conteúdo (peso 1) -- normaliza acento/caixa. Usada
só na home (`/help`); sem busca vazia mostrando todos os artigos (a home sem
termo mostra categorias, não uma lista).

Sem resultado: mensagem "Não encontramos uma orientação para essa dúvida.",
com atalho para primeiros passos e para limpar a busca (Parte 21). Sem
chatbot, sem IA.

## 4. Ajuda contextual (Parte 6)

Componente `help-hint.tsx` (`<HelpHint articleSlug="..." />`): ícone "?" +
rótulo "Entenda", mesmo padrão visual/de interação do `Dropdown` já existente
no design system (painel posicionado, fecha ao clicar fora) -- nenhum
componente de popover novo foi introduzido. **Nunca renderiza nada se o
`articleSlug` não existir** -- proteção automática contra link de ajuda
quebrado, testada (`help-hint.test.tsx`).

Adicionado (Parte 19), de forma seletiva, nos pontos de maior ganho real de
compreensão:
- `/vehicles/[id]` e `/drivers/[id]`, aba Documentos → artigo
  "documentos-de-frota".
- `/maintenances` → artigo "manutencao".
- `/notifications` → artigo "alertas-e-notificacoes".
- `/trips/[id]` → artigo "ciclo-de-vida-da-viagem".

Deliberadamente **não** adicionado em todo campo/tela -- só onde havia
dúvida real identificada no levantamento (status, vencimento de documento,
fluxo de manutenção, alertas).

## 5. Onboarding (Partes 9-11)

`onboarding-modal.tsx` (5 passos, `onboarding-steps.ts`): Começar, Avançar,
Voltar, Pular, Fechar -- nunca bloqueia o uso do sistema, pode ser fechado em
qualquer passo. Reaberto a qualquer momento pelo botão "Rever introdução" em
`/help`.

`onboarding-launcher.tsx`: montado **uma vez** em `AppShell` (nunca por
página) -- mostra o modal automaticamente no primeiro acesso de cada usuário.

### Persistência -- decisão registrada (Parte 11)

Auditoria prévia confirmou que **não existe** hoje nenhum mecanismo de
preferência POR USUÁRIO no backend: `UserAccount` não tem campo de
preferências/JSON. `TenantSettings.preferences` existe, mas é POR TENANT
(compartilhado por todos os usuários da transportadora) -- marcaria o
onboarding como visto para todo mundo ao mesmo tempo, o que é o
comportamento errado aqui.

Decisão: **localStorage**, chaveado por `tenantId+userId`
(`help.onboarding.dismissed.<tenantId>.<userId>`) -- nunca só por navegador,
para não misturar usuários diferentes em um computador compartilhado. Sem
migration, sem endpoint novo. Testado, incluindo o caso de `localStorage`
indisponível (modo privado) degradando para "nunca visto", sem lançar erro
(`onboarding-storage.test.ts`).

Se no futuro for necessário que o onboarding acompanhe o usuário entre
dispositivos, caberia um campo de preferências no backend -- fora do escopo
desta fase.

## 6. Levantamento -- GAPs identificados (fora do escopo desta fase)

Confirmados durante a auditoria prévia, registrados aqui e **não
implementados** (Parte 18/26):
- Não existe "esqueci minha senha" nem troca de senha pelo usuário, no
  admin-web nem no driver-app.
- Não existe troca de tenant/empresa pela UI (login é fixo por tenantId).
- Não existe vínculo motorista↔usuário do app exposto na UI de cadastro de
  motorista (existe só no banco).
- Torre de Controle não mostra documentos de frota vencidos (Fase 119
  confirmou isso de forma independente).
- Upload de comprovante de entrega (POD) só existe no driver-app -- não há
  upload pela admin-web.

Nenhum desses GAPs foi corrigido nesta fase -- são comportamento real do
produto hoje, documentado como tal (nunca como ausência a se queixar).

## 7. Testes

- `search.test.ts`, `onboarding-storage.test.ts` -- lógica pura, TDD
  (RED/GREEN confirmado antes da implementação).
- `help-hint.test.tsx`, `onboarding-modal.test.tsx`, `onboarding-launcher.test.tsx`
  -- componentes, TDD.
- `content/index.test.ts`, `primeiros-passos.test.ts` -- integridade do
  conteúdo (sem link quebrado, sem slug duplicado).
- `help-home.test.tsx`, `help-article-page.test.tsx`, `primeiros-passos-page.test.tsx`
  -- páginas: renderização, busca, resultado, ausência de resultado,
  abertura de artigo, 404 de slug inexistente.

## 8. O que NÃO foi feito (deliberado)

Nenhuma funcionalidade de negócio nova, nenhum status/enum novo, nenhuma
regra de notificação/alerta alterada, nenhum bloqueio de uso criado, nenhuma
migration, nenhum endpoint de backend, nenhum CMS, nenhuma busca
externa/IA/chatbot.
