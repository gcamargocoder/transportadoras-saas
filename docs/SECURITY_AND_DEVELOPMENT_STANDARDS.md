# Security and Development Standards — Transportadoras SaaS

> **Status: especificação oficial e obrigatória do projeto.**
> Este documento não é apenas referência — define regras de desenvolvimento que
> toda fase futura deve obedecer integralmente. Nenhuma fase é considerada
> concluída se violar qualquer regra aqui descrita. Em caso de conflito entre
> uma instrução de fase e este documento, este documento prevalece, salvo
> instrução explícita em contrário do usuário.

---

## 1. Filosofia do projeto

- **Security First** — nenhuma funcionalidade é aceitável se comprometer segurança. Segurança não é uma etapa posterior, é um requisito de aceitação de cada fase.
- **Multi-Tenant First** — todo dado operacional pertence a uma transportadora (`tenantId`). Isolamento entre tenants é inegociável e vale mais que qualquer atalho de implementação.
- **API First** — o contrato HTTP (rotas, DTOs, respostas, Swagger) é desenhado antes/junto da implementação, nunca como reflexo acidental de detalhes internos.
- **Clean Architecture** — separação clara entre `controllers` (HTTP), `services` (regra de negócio), acesso a dados (Prisma direto ou `repositories/` quando o caso justificar) e `entities`/`dto` (contrato externo).
- **SOLID** — em particular Single Responsibility (um service por agregado) e Dependency Inversion (injeção via construtor, nunca instanciação manual).
- **Clean Code** — nomes descritivos, funções pequenas, sem "código morto".
- **DRY** — lógica compartilhada (paginação, auditoria, validação de unicidade por tenant) vive em utilitários/`common/`, nunca duplicada módulo a módulo.
- **KISS** — a solução mais simples que atende ao requisito vence sobre abstrações antecipadas para necessidades hipotéticas.
- **Convention over Configuration** — todo módulo novo segue a mesma estrutura de pastas e os mesmos nomes de arquivo já estabelecidos (ver seção 5).

---

## 2. Segurança

Obrigatório em todo código que lida com autenticação, dados de tenant ou entrada externa:

| Requisito                              | Como se aplica neste projeto                                                                                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criptografia de senhas (Argon2id)      | `argon2` (variante id) via `apps/api/src/auth/utils/password.util.ts` — nunca `bcrypt`, nunca hash reversível.                                                                                                                     |
| Hash de refresh tokens                 | Refresh token nunca é persistido em texto puro — apenas seu hash (`RefreshToken.tokenHash`), permitindo revogação sem expor o token original.                                                                                      |
| JWT Access + Refresh                   | Access token de vida curta (`JWT_ACCESS_EXPIRES_IN`, default 15m) + refresh de vida longa (`JWT_REFRESH_EXPIRES_IN`, default 7d), segredos distintos via `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`.                                 |
| Rotação de refresh token               | A cada `POST /auth/refresh`, o token usado é invalidado e um novo par é emitido — nunca reaproveitar o mesmo refresh token duas vezes.                                                                                             |
| Revogação de sessão                    | Logout e troca de senha invalidam o(s) `RefreshToken` correspondente(s) no banco.                                                                                                                                                  |
| Secrets apenas via ENV                 | Nenhum segredo (JWT secret, DB password, API key) em código-fonte ou arquivo versionado — sempre `process.env.*`, validado em `config/env.validation.ts`.                                                                          |
| Nenhum segredo hardcoded               | Revisão obrigatória antes de commit: `git diff` não pode conter senha/token/chave literal.                                                                                                                                         |
| Helmet                                 | Cabeçalhos de segurança HTTP (`Content-Security-Policy`, `X-Frame-Options`, etc.) — **pendente**: ainda não wired em `main.ts`. Deve ser adicionado na primeira fase que tocar bootstrap/infra, antes de ir a produção.            |
| CORS restritivo                        | `app.enableCors({ origin: CORS_ORIGIN, credentials: true })` já implementado em `main.ts` — `CORS_ORIGIN` deve ser lista explícita de domínios em produção, nunca `*`.                                                             |
| Rate Limit                             | Proteção contra brute-force/DoS em rotas sensíveis (`/auth/login`, `/auth/refresh`) — **pendente**: `@nestjs/throttler` ainda não integrado. Deve ser adicionado antes de expor o backend publicamente.                            |
| DTO Validation                         | `ValidationPipe` global (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`) já ativo — todo endpoint recebe apenas os campos declarados no DTO, com validação `class-validator`.                                  |
| Sanitização                            | `whitelist`/`forbidNonWhitelisted` já removem/rejeitam campos não declarados; nenhum HTML de entrada é renderizado sem escape no frontend.                                                                                         |
| SQL Injection Prevention               | Acesso a dados exclusivamente via Prisma Client (queries parametrizadas) — proibido `$queryRawUnsafe`/concatenação de string SQL com input do usuário.                                                                             |
| XSS Prevention                         | API retorna apenas JSON (nunca HTML dinâmico); frontend é responsável por escapar saída — nenhuma resposta de API deve conter HTML não sanitizado.                                                                                 |
| CSRF quando aplicável                  | API é stateless (Bearer JWT, sem cookies de sessão) — CSRF não se aplica ao padrão atual; reavaliar se cookies de sessão forem introduzidos.                                                                                       |
| Upload privado                         | Ver seção 10 — nenhum upload público.                                                                                                                                                                                              |
| Bucket privado                         | Qualquer storage externo (S3/GCS) configurado com acesso privado por padrão; URLs assinadas/temporárias quando necessário.                                                                                                         |
| HTTPS obrigatório                      | Terminação TLS é responsabilidade da infra de deploy (reverse proxy/load balancer) — a aplicação nunca deve aceitar tráfego HTTP não criptografado em produção.                                                                    |
| Nunca retornar stack trace em produção | `AllExceptionsFilter` (`common/filters/all-exceptions.filter.ts`) já centraliza toda resposta de erro em um formato padronizado (`ApiErrorResponse`) e loga stack trace apenas server-side (`Logger`), nunca no corpo da resposta. |
| Nunca expor informações sensíveis      | Entities de resposta (`*.entity.ts`) nunca incluem `passwordHash`, `tokenHash` ou equivalentes — mapeamento explícito via `mappers/`, nunca `return prismaModel` direto.                                                           |

---

## 3. Multi-Tenant

Obrigatório em todo módulo de negócio:

- **Todo dado operacional possui `tenantId`** — toda tabela de domínio (não-global) tem a coluna `tenant_id` com FK para `tenants` e índice dedicado (`@@index([tenantId])`).
- **Nunca permitir acesso cross-tenant** — toda busca por id único (`findUnique`/`findFirst`) usada em rotas autenticadas deve filtrar por `tenantId` explicitamente (ex: `findFirst({ where: { id, tenantId, deletedAt: null } })`), nunca `findUnique({ where: { id } })` isolado. Um id válido de outro tenant deve sempre resultar em `404`, nunca em `403` (não vaza a existência do registro).
- **Toda query deve respeitar `TenantContext`** — o tenant ativo da requisição vem de `TenantContext.requireTenantId()` (populado pelo `TenantInterceptor` a partir do usuário autenticado), nunca de parâmetro de rota, query string ou corpo da requisição.
- **Guards obrigatórios** — `JwtAuthGuard` + `RolesGuard` + `TenantGuard` já registrados globalmente via `APP_GUARD`; nenhum controller de negócio deve desabilitá-los individualmente sem justificativa explícita (ex: `@Public()` documentado).
- **Interceptors obrigatórios** — `TenantInterceptor` já registrado globalmente via `APP_INTERCEPTOR`, responsável por popular `TenantContext` por requisição (`Scope.REQUEST`).
- **Nunca confiar em tenant enviado pelo frontend** — nenhum DTO de entrada deve aceitar `tenantId` como campo editável em rotas autenticadas; o único ponto onde um tenant "nasce" é o cadastro público (`POST /tenants`), e mesmo aí o `tenantId` resultante nunca é aceito de volta como input em chamadas subsequentes.

---

## 4. Banco de Dados

Obrigatório em toda migration/model novo:

- **Foreign Keys** — toda relação usa `@relation` explícito no Prisma, nunca uma coluna solta sem constraint.
- **Índices** — nenhuma tabela sem índice nas FKs (`@@index([tenantId])`, `@@index([fleetId])`, etc.); combinações de filtro/ordenação frequentes (ex: `[tenantId, status]`) recebem índice composto.
- **Constraints** — regras de formato/obrigatoriedade que o banco pode garantir (`NOT NULL`, tipo, tamanho via `@db.VarChar(n)`) são aplicadas no schema, não apenas no DTO.
- **Unique Keys** — toda unicidade de negócio (placa/RENAVAM/chassi por tenant, CPF/CNH por tenant, e-mail por tenant, slug de tenant) é uma `@@unique` no banco, nunca apenas checada em código (evita condição de corrida).
- **Cascade apenas quando explicitamente permitido** — `onDelete: Cascade` só em relações onde a exclusão do pai deve mesmo destruir o filho (ex: `Tenant → *`); relações onde isso não é seguro usam `Restrict` ou `SetNull` (ex: `TripComposition.vehicle` usa `Restrict`).
- **Soft Delete quando fizer sentido** — entidades operacionais consultadas/auditadas ao longo do tempo (Driver, UserAccount, Vehicle, Trailer, Trip) usam `deletedAt`; entidades puramente administrativas com regra de "só exclui se vazio" (Tenant) usam hard delete guardado por checagem de relacionamento.
- **AuditLog** — toda mutação relevante (create/update/delete/status) grava um `AuditLog` (ver seção 8).
- **Migrations obrigatórias** — nenhuma alteração de schema é aplicada manualmente no banco; sempre via `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script` seguido de `prisma migrate deploy`, com o `.sql` versionado em `packages/database/prisma/migrations/`.
- **Schema versionado** — `schema.prisma` é a fonte única de verdade, sempre committado junto da migration correspondente.
- **Nenhuma tabela sem índices nas FKs** — checagem obrigatória ao revisar qualquer novo model antes de gerar a migration.

---

## 5. API

Obrigatório em todo endpoint novo:

- **REST** — recursos como substantivos no plural (`/drivers`, `/vehicles`), verbos HTTP semânticos (`GET`/`POST`/`PATCH`/`DELETE`), sem verbos na URL exceto sub-ações claras (`/status`, `/user-link`).
- **Versionamento** — toda rota de negócio vive sob `/api/v1/...` (`app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`, já configurado em `main.ts`).
- **Swagger** — todo endpoint documentado com `@ApiTags`, `@ApiOperation`, `@ApiOkResponse`/`@ApiCreatedResponse`/`@ApiNoContentResponse` e as respostas de erro relevantes (`@ApiNotFoundResponse`, `@ApiConflictResponse`); disponível em `/api/docs`.
- **DTOs** — toda entrada (`body`/`query`) é uma classe `class-validator`, nunca `any`/objeto solto; toda saída é mapeada para uma `*Entity` dedicada via função em `mappers/`, nunca o retorno cru do Prisma.
- **ValidationPipe** — global, `whitelist + forbidNonWhitelisted + transform` (já configurado).
- **ExceptionFilter** — `AllExceptionsFilter` global, resposta de erro padronizada (ver seção 2).
- **TransformInterceptor** — resposta de sucesso padronizada (`{ success: true, data: ... }`, já implementado em `common/interceptors/transform.interceptor.ts`).
- **LoggingInterceptor** — toda requisição logada (método, rota, duração, status) via `common/interceptors/logging.interceptor.ts`.
- **Responses padronizadas** — sucesso e erro sempre seguem `ApiSuccessResponse`/`ApiErrorResponse` (`common/interfaces/api-response.interface.ts`); listagens paginadas sempre `{ items, meta }` via `PaginationMetaEntity`.

Estrutura de pastas obrigatória por módulo (convenção já usada em `tenants/`, `drivers/`, `fleet/`):

```
<modulo>/
  controllers/
  services/
  dto/
  entities/
  mappers/
  interfaces/        (quando houver contrato interno reutilizável, ex: contagem de relacionamento)
  validators/         (quando houver validação de formato específica do domínio)
  utils/               (funções puras testáveis isoladamente, ex: normalização/checksum)
  repositories/       (apenas quando o módulo justificar uma camada de acesso a dados dedicada — não é padrão obrigatório em todo módulo)
  <modulo>.module.ts
```

---

## 6. Autenticação

- **Argon2id** para hash de senha (`auth/utils/password.util.ts`), nunca outro algoritmo.
- **JWT** de acesso, assinado com `JWT_ACCESS_SECRET`, expiração curta.
- **Refresh** token de longa duração, hash persistido em `RefreshToken`, nunca o valor puro.
- **Logout** revoga o(s) refresh token(s) da sessão.
- **Rotação** — cada uso de refresh token o invalida e emite um novo (previne replay).
- **Revogação** — refresh token comprometido/expirado/reutilizado é rejeitado (`Refresh token invalido ou revogado.`).
- **Bearer** — toda rota autenticada exige `Authorization: Bearer <accessToken>`; nunca token em query string.

---

## 7. Autorização

- **RBAC** — `UserRole` enum (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `OPERATOR`, `DISPATCHER`, `AUDITOR`, `DRIVER`) já modelado; todo endpoint de escrita declara `@Roles(...)` explicitamente.
- **Roles** — política de permissão centralizada por módulo em `constants/*-roles.constants.ts` (ex: `DRIVER_READ_ROLES`/`DRIVER_WRITE_ROLES`, `FLEET_READ_ROLES`/`FLEET_WRITE_ROLES`), nunca a lista de roles repetida decorator a decorator.
- **Permissões** — leitura operacional é tipicamente mais ampla que escrita; escrita restrita a papéis de gestão (`SUPER_ADMIN`/`ADMIN`/`MANAGER`), nunca aberta por padrão.
- **Menor privilégio** — todo endpoint novo começa com o conjunto de roles mínimo necessário; ampliar acesso é uma decisão explícita, não o padrão.

---

## 8. Auditoria

Toda mutação relevante (create/update/delete/status/link) registra um `AuditLog` via `AuditService.log(...)`, contendo:

| Campo    | Origem                                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quem     | `userId` do ator autenticado (nunca a entidade sendo modificada)                                                                                                                                                                                                    |
| Quando   | `createdAt` automático do `AuditLog`                                                                                                                                                                                                                                |
| IP       | `RequestMetadata.ipAddress`, extraído via `extractRequestMetadata(request)`                                                                                                                                                                                         |
| Device   | `RequestMetadata.userAgent`                                                                                                                                                                                                                                         |
| Antes    | `previousValue` (snapshot relevante pré-mutação, via `toJsonSafe`)                                                                                                                                                                                                  |
| Depois   | `newValue` (snapshot pós-mutação, ou `null` em exclusões)                                                                                                                                                                                                           |
| Entidade | `entityName` + `entityId`                                                                                                                                                                                                                                           |
| Tenant   | `tenantId` — **atenção**: em exclusões de `Tenant`, usar o tenant do ator, nunca o tenant excluído (`AuditLog.tenantId` tem `onDelete: Cascade` a partir de `Tenant` — gravar com o id do tenant excluído destruiria o próprio registro de auditoria pela cascata). |

---

## 9. Logs

**Nunca registrar em log (aplicação, `LoggingInterceptor`, `AuditLog` ou qualquer `console.log`):**

- senha (mesmo hasheada, exceto nos campos internos do banco protegidos por acesso)
- JWT (access token)
- refresh token (valor puro — apenas seu hash já é o que se persiste)
- service role / chave de API / segredo de integração
- qualquer segredo de configuração (`JWT_*_SECRET`, `DATABASE_URL` completa)

Entities de resposta e payloads de auditoria devem ser revisados para garantir que nenhum desses valores vaze por engano (ex: `previousValue`/`newValue` do `AuditLog` nunca deve incluir `passwordHash`/`tokenHash` — usar snapshot parcial, não o objeto Prisma completo).

---

## 10. Uploads

- **Sempre privados** — nenhum arquivo enviado por um tenant é acessível por URL pública direta.
- **Nunca públicos** — quando um módulo de upload for implementado (fora do escopo atual — hoje `Document`/`Attachment` no schema guardam apenas metadado, sem upload de arquivo), o storage deve ser privado por padrão, com acesso via URL assinada de curta duração ou proxy autenticado que valide `tenantId`.

---

## 11. Performance

- **Índices** — ver seção 4; toda query de listagem filtrada/ordenada por um campo tem índice correspondente.
- **Paginação** — toda listagem usa `PaginationQueryDto` (`page`/`pageSize`, máximo 100 por página) e retorna `meta` (`total`/`page`/`pageSize`/`totalPages`); nunca retornar coleção completa sem paginação em endpoints que podem crescer sem limite.
- **Busca eficiente** — filtros de texto usam `contains` com índice adequado ou campo normalizado; evitar `OR` amplo sem necessidade.
- **Evitar N+1** — relações necessárias na resposta são carregadas via `include`/`select` do Prisma na própria query, nunca em loop (`for (...) await prisma.x.findUnique(...)`).
- **Evitar consultas desnecessárias** — contagens/checagens de existência usadas apenas para validação usam `count`/`findFirst` (não `findMany` completo); operações independentes são paralelizadas com `Promise.all` (padrão já usado em `countRelationships`/guardas de exclusão).

---

## 12. Testes

Toda fase deve terminar com todos os comandos abaixo executados e **passando sem erro**, sem exceções:

```bash
pnpm --filter @transportadoras/api typecheck
pnpm --filter @transportadoras/api lint
pnpm --filter @transportadoras/api build
pnpm --filter @transportadoras/api test
pnpm --filter @transportadoras/api test:e2e
```

Convenção de cobertura já estabelecida no projeto:

- **Unitários** (`*.spec.ts` ao lado do arquivo testado) — funções puras/utilitários e validadores (`utils/`, `interfaces/*counts*`), independentes de banco.
- **E2e** (`apps/api/test/*.e2e-spec.ts`, banco Postgres real via Docker) — cobrem CRUD completo, validações, unicidade, isolamento multi-tenant, permissões por role e regras de negócio (guardas de exclusão, vínculos opcionais). É o nível principal de cobertura de `services`/`controllers`.

---

## 13. Git

- Cada fase termina com `git add` (arquivos relevantes, nunca `-A`/`.` sem revisar `git status` antes) seguido de `git commit` com mensagem descritiva no padrão `feat: fase N - <resumo>`.
- **Nunca deixar código quebrado** — um commit de fim de fase só acontece depois que todos os comandos da seção 12 passam.
- Nenhum commit inclui segredo (`.env`, credenciais) — revisar `git status`/conteúdo de arquivos suspeitos antes de `git add`.

---

## 14. Deploy

Preparar/manter compatibilidade com:

- **Docker** — `docker-compose.yml` já sobe Postgres com PostGIS para desenvolvimento; imagem de produção da API é responsabilidade de fase de deploy dedicada.
- **Postgres** — banco relacional principal, único destino de persistência de dados de negócio.
- **PostGIS** — extensão geoespacial já habilitada (`postgis/postgis:16-3.4`), necessária para `Location.geoPoint`/telemetria futura.
- **Prisma** — ORM único, migrations como fonte de verdade do schema (ver seção 4).
- **CI/CD** — pipeline (quando implementado) deve rodar exatamente os comandos da seção 12 como gate obrigatório antes de qualquer deploy.

---

## 15. Checklist obrigatório antes de concluir qualquer fase

Antes de considerar qualquer fase finalizada, confirmar explicitamente:

- [ ] **Build** — `pnpm --filter @transportadoras/api build` sem erro.
- [ ] **Lint** — `pnpm --filter @transportadoras/api lint` sem erro.
- [ ] **Typecheck** — `pnpm --filter @transportadoras/api typecheck` sem erro.
- [ ] **Testes** — `test` e `test:e2e` 100% passando (nenhum teste pulado/skip sem justificativa).
- [ ] **Segurança** — nenhum segredo hardcoded, nenhuma stack trace exposta, senha/token nunca logados ou retornados em entity.
- [ ] **Multi-tenant** — toda query nova filtra por `tenantId` via `TenantContext`; nenhum acesso cross-tenant possível (validado por teste e2e de isolamento).
- [ ] **Performance** — nova query de listagem paginada e indexada; nenhum N+1 introduzido.
- [ ] **Swagger** — todo endpoint novo documentado (`@ApiOperation` + respostas).
- [ ] **Auditoria** — toda mutação relevante grava `AuditLog` com os campos da seção 8.
- [ ] **Logs** — nenhum dado sensível (seção 9) presente em log novo.
- [ ] **Commit** — `git add` + `git commit` com o código nos estados acima confirmados.

Se qualquer item deste checklist falhar, a implementação deve ser corrigida **antes** de finalizar a fase — a fase não é considerada concluída com um item pendente sem que isso seja explicitamente reportado como pendência.

---

## Aplicação automática

A partir da criação deste documento, toda fase futura passa a ser validada contra ele antes de ser reportada como concluída. Violações encontradas são corrigidas dentro da própria fase; quando uma regra não puder ser satisfeita integralmente sem expandir o escopo pedido (ex: Helmet/rate limit, hoje pendentes — ver seção 2), isso é reportado explicitamente como pendência no relatório final da fase, nunca omitido silenciosamente.
