# Super Administração da Plataforma (Fase 47)

Transforma o sistema numa plataforma SaaS onde `SUPER_ADMIN` administra
todas as transportadoras clientes, sem quebrar o isolamento multi-tenant
existente. Auditoria prévia confirmou que **a maior parte do CRUD
administrativo cross-tenant já existia e estava testada**
(`TenantsController`/`TenantsService`/`TenantsRepository`,
`GET/PATCH/DELETE /tenants` e `/tenants/:id`). O trabalho desta fase foi
estender esse módulo já existente — nenhum módulo/serviço/tabela novo foi
duplicado.

## 1. Arquitetura

Tudo vive em `apps/api/src/tenants/` (controller/service/repository
únicos, estendidos) — deliberadamente **nenhum módulo `super-admin` novo**
no backend. A única exceção é o frontend, que tem uma área própria
(`apps/admin-web/src/app/super-admin/`) com layout/shell/guard distintos
do resto do app.

```
TenantsController (rotas existentes, intocadas)
  ├─ POST /tenants                 -- self-service signup (@Public)
  ├─ GET/PATCH /tenants/me*        -- self-service da própria empresa
  ├─ GET /tenants                  -- listagem cross-tenant (SUPER_ADMIN)
  ├─ GET/PATCH/DELETE /tenants/:id -- CRUD cross-tenant (SUPER_ADMIN)
  └─ [Fase 47] rotas novas, todas SUPER_ADMIN + ADMIN_THROTTLE:
       ├─ GET /tenants/dashboard        -- agregados da plataforma inteira
       ├─ GET /tenants/:id/usage        -- utilização real de 1 tenant
       ├─ GET /tenants/:id/history      -- auditoria (reaproveita AuditService)
       ├─ PATCH /tenants/:id/status     -- status de ciclo de vida
       └─ PATCH /tenants/:id/plan       -- plano/limites/módulos
```

## 2. SUPER_ADMIN e o fix do TenantGuard

`UserAccount.tenantId` é obrigatório no schema — não existe usuário "sem
tenant" hoje, nem para `SUPER_ADMIN`. O `TenantGuard` (global, via
`APP_GUARD`) bloqueava QUALQUER usuário, inclusive `SUPER_ADMIN`, se o
tenant "casa" dele ficasse `isActive=false`.

**Fix mínimo e cirúrgico**: `TenantGuard` continua exigindo que o tenant
exista, mas só bloqueia por `isActive=false` quando `role !==
SUPER_ADMIN`. `request.tenant` continua sendo populado normalmente em
ambos os casos (consumido por `DELETE /tenants/:id` para o audit log do
ator). Isso resolve "SUPER_ADMIN não deve depender de tenantId para
acessar administração global" sem tocar em login/JWT/schema de usuário —
um refactor completo (tenantId nulo no JWT) seria desproporcional ao
escopo desta fase.

O comentário de `JwtPayload` que prometia `tenantId: null` para Super
Admin (nunca implementado) foi corrigido para refletir a realidade.

## 3. Status de ciclo de vida

Novo enum `TenantStatus` (`ACTIVE`/`TRIAL`/`SUSPENDED`/`EXPIRED`), campo
`Tenant.status` (`@default(ACTIVE)`, aditivo). O `isActive: Boolean`
existente **não foi removido** — continua sendo o campo que o
`TenantGuard` de fato usa para bloquear acesso.

Sincronização **numa via só** (`PATCH /tenants/:id/status` →
`TenantsService.changeStatus`): `ACTIVE`/`TRIAL` ⇒ `isActive=true`;
`SUSPENDED`/`EXPIRED` ⇒ `isActive=false`. O self-service `PATCH
/tenants/me/status` (só `isActive` boolean) não foi alterado — continua
funcionando exatamente como antes, sem noção do `status` novo.

`EXPIRED` é **sempre manual** nesta fase — não há transição automática
baseada em `trialEndsAt` (evita inventar um job de expiração/cron fora do
escopo pedido).

## 4. Planos, módulos e limites

Novo model `TenantPlan` (1:1 com `Tenant`, mesmo padrão de
`TenantSettings`): `tier` (`FREE`/`STARTER`/`PROFESSIONAL`/`ENTERPRISE`,
nomes genéricos ajustáveis depois, sem preço/cobrança), `trialEndsAt`,
limites (`maxUsers`/`maxVehicles`/`maxDrivers`/`maxStorageMb`, `null` =
sem limite) e `enabledModules: TenantModule[]` (default = todos os 9
módulos habilitados).

Todo tenant novo ganha um `TenantPlan` padrão na mesma transação que já
cria `Tenant`+`TenantSettings`+admin (`TenantsService.create()`,
extensão de 1 linha). Tenants existentes foram migrados com um `INSERT
... WHERE NOT EXISTS` na própria migration — nenhum tenant fica sem
plano.

**`isModuleEnabled(plan, module)`**
(`apps/api/src/tenants/utils/tenant-module.util.ts`) — função pura,
testada isoladamente, que resolve "este módulo está habilitado para este
tenant?". **Deliberadamente NÃO conectada a nenhum guard/controller
existente nesta fase** — o pedido explicitamente pede "não bloquear
módulos existentes de forma arbitrária" e conectar isso em todo o sistema
seria uma mudança funcional ampla fora do escopo (auditoria geral
repetitiva). Fica pronta para uso em fase futura.

Sem cobrança/Stripe nesta fase, conforme pedido.

## 5. Dashboard global e utilização

`GET /tenants/dashboard` é a **primeira agregação verdadeiramente
cross-tenant** do projeto (sem `where: {tenantId}` nenhum) — confirmado
por auditoria que não existia nenhum `groupBy(['tenantId'])` antes desta
fase. Sempre `Promise.all` de `count`/`groupBy`, nunca 1 query por tenant:
total de tenants, breakdown por status, totais de usuários/veículos/
motoristas na plataforma inteira, distribuição por plano, e atividade
recente (viagens/checklists concluídos nos últimos 30 dias) — tudo dado
real, sem métrica inventada.

`GET /tenants/:id/usage` — 8 contagens em paralelo (usuários, motoristas,
veículos, viagens, checklists, abastecimentos, manutenções, anexos —
anexos como proxy real de uso de armazenamento, já que não há medição de
bytes). Distinto de `countRelationships` (usado só como guarda de
exclusão) — responsabilidades diferentes, nunca misturadas na mesma
função.

Listagem paginada (`GET /tenants`) ganhou `userCount`/`vehicleCount` por
linha, resolvidos em **2 queries em lote para a página inteira**
(`groupBy(['tenantId'])`), nunca 1 par de queries por linha — validado
por teste de N+1 (10 vs. 50 tenants).

## 6. Auditoria

Reaproveita 100% o `AuditService` já existente (Fase 46) — nenhum sistema
de auditoria novo. Novas ações: `tenant.lifecycle_status_changed`,
`tenant.plan_updated`. `GET /tenants/:id/history` reaproveita
`AuditService.findByEntity`/`PaginatedAuditLogEntity`/`toAuditLogEntity`,
o MESMO padrão já usado por `VehiclesService.getHistory` (`GET
/vehicles/:id/history`) — zero infraestrutura nova.

## 7. Segurança

- Todas as rotas novas: `@Roles(SUPER_ADMIN)` + `@Throttle(ADMIN_THROTTLE)`
  (mesmo preset já usado nas rotas SUPER_ADMIN existentes).
- `ADMIN`/`DRIVER` recebem 403 em toda rota nova (testado).
- `TenantContext.tenantId` nunca vem do cliente — sempre do JWT
  decodificado (comportamento pré-existente, não alterado).
- `SUPER_ADMIN` com o próprio tenant "casa" suspenso continua acessando
  `/tenants/dashboard` (testado — prova direta do fix do `TenantGuard`).
- Alteração de status/plano exige `SUPER_ADMIN` (testado).

## 8. Frontend

Área `apps/admin-web/src/app/super-admin/` **fora** do route group
`(app)` — layout/shell/sidebar próprios
(`components/layout/super-admin-shell.tsx`), nunca reaproveita
`AppShell`/`SidebarNav` da aplicação normal, para deixar visualmente
óbvio que o usuário está na administração global, não na empresa de
ninguém. `SuperAdminGuard` (auth + role `SUPER_ADMIN_ONLY`) — nunca um
mecanismo de autenticação paralelo, só decide para onde redirecionar; a
autoridade real continua sendo o backend.

- `/super-admin` — dashboard (`StatCard`s + `BarRankingChart` de
  distribuição por plano), componentes 100% reaproveitados.
- `/super-admin/tenants` — listagem (busca + filtro por status +
  `DataTable` + paginação, mesmo padrão de `/vehicles`) + modal de
  criação (reaproveita `POST /tenants` existente).
- `/super-admin/tenants/[id]` — detalhe: dados cadastrais, controle de
  status, utilização, editor de plano/limites/módulos, histórico de
  auditoria paginado.

Link de entrada no menu normal (`lib/nav-config.ts`, item "Plataforma",
`SUPER_ADMIN_ONLY`) — único ponto de contato entre as duas áreas.

## 9. Limitações reais

- `EXPIRED` é sempre definido manualmente pelo `SUPER_ADMIN` — sem
  transição automática baseada em `trialEndsAt`.
- Sem cobrança/Stripe (fora de escopo desta fase, conforme pedido).
- **[Fase 48]** `isModuleEnabled` e os limites (`maxUsers` etc.) agora
  SÃO aplicados de fato — ver `docs/plan-enforcement.md` para o mecanismo
  completo, o mapeamento módulo→controller e as limitações remanescentes
  (ex: `REPORTS` sem controller correspondente, `driver-trips.controller.ts`
  não module-gateado).

## 10. Pendências

- Transição automática de trial → expirado.
- Cobrança/integração de pagamento (Stripe ou equivalente).
- Ver `docs/plan-enforcement.md` § 7 para as pendências específicas do
  enforcement de módulos/limites (Fase 48).
