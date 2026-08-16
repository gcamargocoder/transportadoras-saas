# Hardening de segurança (Fase 46)

Auditoria e correções de segurança do sistema inteiro — autenticação,
RBAC, multi-tenancy, uploads, tokens, rate limiting e auditoria. Auditoria
prévia (3 frentes de exploração) confirmou que a base já era sólida antes
desta fase; o trabalho real foi fechar um conjunto pequeno e bem definido
de gaps confirmados, nunca redesenhar o que já funcionava.

## 1. Autenticação

- Login com mensagem genérica anti-enumeração: usuário inexistente e
  senha incorreta retornam exatamente `AUTH_ERRORS.INVALID_CREDENTIALS`
  (`apps/api/src/auth/constants/auth-error.constants.ts`) — nunca revela
  se o e-mail existe.
- Senha com Argon2id (`apps/api/src/auth/utils/password.util.ts`,
  parâmetros OWASP: memoryCost 19456, timeCost 2, parallelism 1). Hash
  nunca é serializado em nenhuma resposta (`UserEntity` não tem
  `passwordHash`; conversão segura centralizada em
  `apps/api/src/auth/utils/user-mapper.util.ts`).
- **[Fase 46] Bloqueio temporário por conta contra brute force** — ver
  seção 2.
- **[Fase 46] Política de complexidade de senha** — ver seção 11.

## 2. Bloqueio temporário de login (novo)

`apps/api/src/auth/services/login-protection.service.ts`
(`LoginProtectionService`). Antes desta fase só existia rate limit por IP
(`AUTH_LOGIN_THROTTLE`, 10/min) — não protegia uma conta específica de um
ataque distribuído por IP ou prolongado no tempo.

- Chave: `tenantId:email` (não expõe o contador entre tenants).
- 5 falhas em 15 minutos → bloqueio de 15 minutos.
- **Nunca permanente**: o bloqueio expira sozinho (checado por
  `Date.now()`, sem job/cron).
- **Nunca estendido por tentativas adicionais**: `isLocked()` é checado
  ANTES de `recordFailure()` em `AuthService.login()` — uma vez
  bloqueado, novas tentativas são rejeitadas sem contar de novo. Isso
  impede que um atacante gere um bloqueio indefinido contra uma conta
  legítima só continuando a tentar.
- **Resposta ao cliente idêntica** esteja a conta bloqueada ou não (401
  genérico) — nunca revela o estado de bloqueio.
- Teto de 5000 chaves rastreadas simultaneamente (evicção da mais antiga)
  — proteção básica contra esgotamento de memória por chaves aleatórias.
- **Deliberadamente in-memory, sem Redis** — não há Redis nem
  infraestrutura de storage compartilhado no projeto hoje (confirmado:
  só Postgres via `docker-compose.yml`, comentário explícito confirma
  isso ser proposital). O próprio `ThrottlerGuard` global já tem a mesma
  limitação (in-memory, por instância) e é aceito hoje. Ver "Limitações
  reais" abaixo.

## 3. Tokens / sessões

- JWT access (15min, `JWT_ACCESS_EXPIRES_IN`) + refresh (7d,
  `JWT_REFRESH_EXPIRES_IN`), segredos distintos.
- Tabela `RefreshToken` no Postgres (`packages/database/prisma/schema.prisma`):
  rotação real a cada refresh (token antigo revogado imediatamente) com
  detecção de replay (reuso de um refresh já revogado é rejeitado).
- Logout revoga de fato no servidor (`revokedAt`), idempotente.
- Access token é stateless — não há blocklist. Um token roubado continua
  válido até expirar (máx. 15min). Ver "Limitações reais".

## 4. Rate limiting

`ThrottlerModule` global (`apps/api/src/app.module.ts`,
`common/config/throttler.config.ts`): 100 req/min por padrão em toda
rota, desligado quando `NODE_ENV=test` (decisão pré-existente, evita 429
espúrio no volume de requisições da suíte e2e).

Presets nomeados (`common/constants/throttle.constants.ts`),
sobrescrevem só o throttler `default` via `@Throttle(...)`:

| Preset | Limite | Onde já estava aplicado |
|---|---|---|
| `AUTH_LOGIN_THROTTLE` | 10/min | login |
| `AUTH_REFRESH_THROTTLE` | 20/min | refresh |
| `AUTH_LOGOUT_THROTTLE` | 30/min | logout |
| `ADMIN_THROTTLE` | 30/min | tenants (GET/GET:id/PATCH), vehicles, maintenances, drivers |
| `CRITICAL_THROTTLE` | 20/min | tenants (DELETE) |

**[Fase 46] `UPLOAD_THROTTLE` (novo, 10/min)** aplicado em:
- `POST /toll-import` (upload de extrato de pedágio)
- `POST /driver/checklists/:id/evidence` (upload de evidência)

**[Fase 46] `ADMIN_THROTTLE` estendido para**:
- `POST /toll-data/sync` (sincronização SUPER_ADMIN, custosa)
- `POST /users`, `PATCH /users/:id`, `PATCH /users/:id/status`

**[Fase 46] `CRITICAL_THROTTLE` estendido para**: `DELETE /users/:id`.

Sem Redis (mesma decisão da seção 2) — `ThrottlerGuard` funciona
corretamente só com 1 instância da API rodando.

## 5. RBAC

`RolesGuard` global (`apps/api/src/auth/guards/roles.guard.ts`, via
`APP_GUARD`): sem `@Roles(...)` na rota, libera qualquer usuário
autenticado. `@Roles()` já estava em uso amplo e correto (30+
controllers) antes desta fase — auditoria confirmou nenhum endpoint de
escrita/admin/financeiro sem proteção de role. Únicos controllers sem
`@Roles`: `auth` (pré-autenticação) e `health` (health check), ambos
esperados.

**[Fase 46]**: os comentários de `roles.guard.ts`/`roles.decorator.ts`
diziam que RBAC era "no-op hoje" — texto desatualizado, corrigido (nunca
foi lógica errada, só documentação enganosa que poderia induzir erro em
revisões de segurança futuras).

Grupos de roles por módulo em `*/constants/*-roles.constants.ts` (ex:
`FLEET_READ_ROLES`/`FLEET_WRITE_ROLES` sempre excluem `DRIVER`).
`SUPER_ADMIN` vs `ADMIN` corretamente separado (ex: `GET/PATCH/DELETE
/tenants/:id` cross-tenant é `SUPER_ADMIN`-only; `GET/PATCH
/tenants/me*` aberto ao próprio tenant).

## 6. Multi-tenancy

`TenantContext.tenantId` (`apps/api/src/tenants/context/tenant-context.ts`)
só lê de `request.tenant`/`request.user.tenantId`, populados por
`TenantGuard` a partir do JWT decodificado — nunca de body/query/header
do cliente. Única exceção legítima: `LoginDto.tenantId`, usado
PRÉ-autenticação para resolver a chave composta `tenantId_email` (não há
JWT ainda nesse momento).

## 7. IDOR

Padrão `findOwnedOrThrow(tenantId, id)` (ou equivalente
`findActiveOrThrow`/`findOrThrow`) usado consistentemente em todos os
módulos de escrita auditados (vehicles, trailers, drivers, trips,
maintenances, tires, checklists, toll-transactions, trip-stops,
fuel-supplies, trip-expenses/revenues/advances, trip-compositions,
fleets, etc.) — sempre valida posse do tenant ANTES de qualquer
`update`/`delete`, retornando 404 uniforme (nunca 403, nunca revela que
o recurso existe em outro tenant). Nenhuma vulnerabilidade IDOR real
encontrada.

Exceções deliberadas e corretas: `TollPlaza`/`TagProvider` são catálogo
GLOBAL (sem `tenantId` no schema), leitura aberta a roles operacionais,
escrita restrita a `SUPER_ADMIN`.

Driver app: `DriverGuard` + `assertOwnedByDriver`
(`apps/api/src/driver-trips/services/driver-trips.service.ts`) garantem
que um motorista só opera em viagens/checklists/paradas que são dele
mesmo, dentro do próprio tenant — sincronização offline não pode agir em
nome de outro motorista.

## 8. Uploads

Dois pontos: `POST /toll-import` (extratos, `.csv`/`.xlsx`) e
`POST /driver/checklists/:id/evidence` (fotos/assinatura,
`.jpg`/`.jpeg`/`.png`). Ambos com `multer` (`diskStorage`):

- Nome do arquivo sempre gerado via `randomUUID()` — nunca o nome
  enviado pelo cliente (protege contra path traversal/overwrite).
- Extensão em whitelist, tamanho máximo configurável por env.
- Disco privado, nunca servido estaticamente.

**[Fase 46] Validação de assinatura de conteúdo (novo)** —
`apps/api/src/common/utils/file-signature.util.ts`
(`assertValidFileSignature`): antes só a extensão era checada (nenhum
mimetype, nenhum conteúdo real — um executável renomeado para
`.png`/`.csv` passava). Agora lê os primeiros bytes do arquivo já salvo
e confere:
- JPEG: `FF D8 FF`
- PNG: `89 50 4E 47 0D 0A 1A 0A`
- XLSX (é um ZIP): `50 4B`
- CSV: sem assinatura binária própria — rejeita se encontrar um byte NUL
  nos primeiros 8KB (forte indício de binário disfarçado de texto)

Em caso de mismatch: arquivo é apagado do disco e a requisição rejeitada
com 400 — nunca aceito silenciosamente. Integrado em
`TollImportService.create()` (logo após `resolveFileType`, reaproveitando
o `safeUnlink` já existente) e `ChecklistExecutionsService.addEvidence()`
(antes de qualquer escrita no banco).

## 9. Auditoria

`AuditService` (`apps/api/src/audit/services/audit.service.ts`) — ponto
único de escrita em `AuditLog`, já usado por ~90 ações antes desta fase.
Nunca inclui senha/token/hash (contrato `AuditLogEntry` não tem campo
para isso). Falha ao gravar auditoria nunca derruba a operação de
negócio (try/catch interno, best-effort).

**[Fase 46] Login agora é auditado**: `auth.login_succeeded` e
`auth.login_failed` (motivo: `invalid_password`) em
`apps/api/src/auth/services/auth.service.ts`. **Deliberadamente NÃO
auditado**: tentativa contra usuário/tenant inexistente e tentativa
bloqueada (`isLocked`) — nesses dois casos não há um `tenantId`/`userId`
validado para atribuir a entrada (o `tenantId` do request pode nem
existir), e forçar isso geraria falha de FK silenciosa ou um formato de
auditoria paralelo. O contador de brute force (seção 2) continua
funcionando normalmente nesses casos, só a trilha de auditoria é que não
cobre essas duas situações específicas.

## 10. Paginação / limites de payload

`PaginationQueryDto` (`apps/api/src/common/dto/pagination-query.dto.ts`):
`pageSize` máximo 100, herdado por todas as 27 `Find*QueryDto` do
projeto. Endpoints de sincronização em lote já tinham teto antes desta
fase: tracking points (`@ArrayMaxSize(500)`), respostas de checklist
(`@ArrayMaxSize(200)`).

## 11. Política de senha

Antes: só `@MinLength(8)`, sem exigência de complexidade.

**[Fase 46]**: `apps/api/src/auth/constants/password-policy.constants.ts`
(`PASSWORD_COMPLEXITY_REGEX` — exige pelo menos 1 letra e 1 número,
mantendo o mínimo de 8 caracteres já existente) aplicado em:
- `CreateUserDto.password` (`apps/api/src/users/dto/create-user.dto.ts`)
- `UpdateUserDto.password` (só quando informado — `@IsOptional()` já
  pula toda a cadeia de validadores quando o campo não vem no payload)
- `CreateTenantAdminDto.password` (conta inicial do tenant, criada via
  `POST /tenants` público)

**Deliberadamente NÃO aplicado em `LoginDto.password`** — esse campo só
compara a senha informada contra o hash já salvo; adicionar a regex lá
rejeitaria (com 400, antes mesmo de chegar no service) o login de
qualquer conta já existente cuja senha antiga não atenda à regra nova.

Verificado que todas as fixtures de senha da suíte e2e inteira
(`'SenhaForte123!'`/`'NovaSenhaForte456!'`) já contêm letra+número — zero
risco de regressão confirmado por grep em todo `apps/api/test/`.

## 12. Headers / CORS / exposição de erros

- `helmet` (`apps/api/src/common/config/security-headers.config.ts`):
  CSP, HSTS (só produção), `frameguard: deny`, `noSniff`, `referrerPolicy:
  no-referrer`, `hidePoweredBy`.
- CORS restrito à origem de `CORS_ORIGIN` (env), nunca wildcard,
  `credentials: true`.
- `AllExceptionsFilter` (`apps/api/src/common/filters/all-exceptions.filter.ts`):
  em produção, qualquer exceção que não seja uma `HttpException`
  deliberada (erro do Prisma, stack, bug não tratado) nunca vai para a
  resposta HTTP — só é logada server-side. Mensagem pública sempre
  genérica em produção.

## 13. Fora de escopo desta fase (documentado, não implementado)

- **Fluxo "esqueci minha senha" self-service**: não existe hoje (só
  reset administrativo via `PATCH /users/:id`, digitado por um
  ADMIN/SUPER_ADMIN). Construir um fluxo completo (token por e-mail,
  expiração, envio de e-mail) é uma funcionalidade de negócio nova, fora
  do que esta fase de hardening autoriza.
- **Revogação de access token (blocklist)**: JWT stateless por design;
  token roubado continua válido até expirar (máx. 15min), mitigado pela
  expiração curta + refresh já revogável. Implementar blocklist exigiria
  infraestrutura nova (Redis, ou uma tabela consultada em toda request
  autenticada) sem uma vulnerabilidade comprovada que justifique o custo
  agora.
- **Redis para rate limiting/lockout distribuído**: sem infraestrutura
  hoje (confirmado); `ThrottlerGuard` e o novo `LoginProtectionService`
  permanecem in-memory.

## 14. Limitações reais (não são bugs, são trade-offs conscientes)

- `ThrottlerGuard` e `LoginProtectionService` são **in-memory,
  por instância** — corretos para 1 instância da API rodando; com
  múltiplas instâncias/pods atrás de um load balancer, cada instância
  tem seu próprio contador (um atacante distribuído entre instâncias
  contornaria parcialmente os limites). Só relevante no dia em que o
  deploy passar a ser multi-instância — não é o caso hoje.
- Não há teste e2e de "429 após exceder o rate limit": o `ThrottlerGuard`
  inteiro é desligado quando `NODE_ENV=test` (decisão pré-existente,
  documentada em `throttler.config.ts`, para não gerar 429 espúrio no
  volume de requisições da suíte inteira). A aplicação dos novos presets
  foi verificada por leitura direta do código, não por e2e — não
  alterado o comportamento de teste global para não arriscar
  instabilidade em toda a suíte por causa disso.
- Access token roubado continua válido até expirar (máx. 15min) — ver
  seção 13.

## 15. Pendências reais

- Fluxo "esqueci minha senha" self-service (seção 13).
- Considerar Redis quando o deploy passar a ser multi-instância (seções
  2, 4, 14).
