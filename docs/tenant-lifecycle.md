# Ciclo de Vida do Tenant e Trial (Fase 49)

Conecta o `TenantStatus` e o `TenantPlan.trialEndsAt` (Fase 47) a uma
transição automática real. Nenhuma estrutura nova de bloqueio foi criada
— **`TenantGuard` já bloqueava `SUSPENDED`/`EXPIRED` desde a Fase 47**
(`TenantsService.changeStatus()` já sincroniza
`isActive = status IN (ACTIVE, TRIAL)` a cada mudança de status). Esta
fase só adiciona o mecanismo que leva um tenant a `EXPIRED`
automaticamente e expõe os dados de trial para o frontend.

## 1. Estados e transições

`TenantStatus`: `ACTIVE`, `TRIAL`, `SUSPENDED`, `EXPIRED` (Fase 47,
inalterado). Transições manuais continuam via
`PATCH /tenants/:id/status` (SUPER_ADMIN, já existente). Única transição
nova **automática**: `TRIAL → EXPIRED` quando `trialEndsAt < agora`.

| Estado | `isActive` | Acesso operacional |
|---|---|---|
| `ACTIVE` | `true` | Normal |
| `TRIAL` | `true` | Normal (módulos/limites do plano continuam valendo) |
| `SUSPENDED` | `false` | Bloqueado (exceto SUPER_ADMIN) |
| `EXPIRED` | `false` | Bloqueado (exceto SUPER_ADMIN) |

## 2. Trial

- `TenantPlan.trialStartedAt` (novo, Fase 49) e `TenantPlan.trialEndsAt`
  (já existia, Fase 47) são preenchidos automaticamente na **primeira**
  transição de um tenant para `TRIAL`
  (`TenantsService.changeStatus()`), nunca sobrescritos depois — preserva
  o histórico mesmo que o SUPER_ADMIN altere o status manualmente depois
  (ex: TRIAL → ACTIVE → TRIAL não reseta a data original).
- Duração default: `DEFAULT_TRIAL_DURATION_DAYS = 14` dias
  (`tenants/constants/tenant.constants.ts`), usada **só** quando
  `trialEndsAt` ainda não foi configurado manualmente via
  `PATCH /tenants/:id/plan`. Se o SUPER_ADMIN já configurou uma data
  específica antes de mudar o status, ela é respeitada.
- Durante o trial, o tenant opera normalmente, respeitando módulos e
  limites do plano (Fase 48, inalterado).

## 3. Expiração automática — scheduler

`TenantLifecycleService.expireOverdueTrials()`
(`tenants/services/tenant-lifecycle.service.ts`): 2 queries no total,
nunca 1 por tenant — `findMany` (só `id`) dos tenants `TRIAL` com
`trialEndsAt` vencido, seguido de 1 `updateMany` em lote
(`status: EXPIRED, isActive: false`). Idempotente por construção: um
tenant já `EXPIRED` não é mais elegível ao filtro `status: TRIAL` na
próxima execução.

`TenantLifecycleScheduler` (`tenant-lifecycle.scheduler.ts`): `@Cron`
diário (`CronExpression.EVERY_DAY_AT_1AM`), registrado em
`TenantsModule` (que passou a importar `ScheduleModule.forRoot()` —
seguro reimportar, é um dynamic module `global: true`; o único outro
scheduler do projeto, `TollDataSyncScheduler`, já faz o mesmo em outro
módulo). Só grava em `Logger` (mesmo padrão do `TollDataSyncScheduler`) —
não grava um `AuditService.log()` por tenant expirado automaticamente
(evitaria N inserts de auditoria por execução para uma ação do próprio
sistema, distinta de uma ação humana).

## 4. Enforcement (nenhuma mudança em `TenantGuard`/`RequireModuleGuard`)

`TenantGuard` (Fase 47, intocado nesta fase) já lança 403
(`TENANT_INACTIVE`) para qualquer usuário não-SUPER_ADMIN de um tenant
com `isActive=false` — em **todo** endpoint autenticado, inclusive
`POST /auth/login`. O scheduler só precisa produzir o mesmo par
`{status: EXPIRED, isActive: false}` que uma mudança manual já produz.
`RequireModuleGuard` (Fase 48) roda depois do `TenantGuard` — nunca
alcançado por um tenant já bloqueado, sem nenhuma alteração necessária.

Dados não são apagados nem viagens são canceladas ao expirar — só o
acesso é bloqueado (testado em e2e).

## 5. SUPER_ADMIN

Nunca bloqueado pelo status de nenhum tenant, inclusive o "tenant casa"
do próprio SUPER_ADMIN (comportamento já existente da Fase 47, testado
de novo nesta fase para o caso `EXPIRED`). Continua vendo/administrando
qualquer tenant via `/super-admin/tenants/:id`, que agora também mostra
início/término do trial e dias restantes.

## 6. Dados de lifecycle para o frontend

`GET /tenants/me` (self-service, já existente) ganhou campos aditivos em
`TenantPlanEntity`, calculados **sempre no backend**
(`tenant.mapper.ts` — `toTenantPlanEntity(plan, now)`, nunca no
navegador, evita problema de timezone/relógio local):

- `trialStartedAt: Date | null`
- `trialDaysRemaining: number | null` — `null` se o tenant nunca esteve
  em trial.
- `trialExpiringSoon: boolean` — `true` quando faltam
  `TRIAL_EXPIRING_SOON_THRESHOLD_DAYS` (3) dias ou menos.

## 7. Admin-web

- `/settings/company`: banner objetivo no topo com a mensagem por status
  ("Seu período de avaliação termina em X dias." / "Período de avaliação
  encerrado." / "Esta conta está suspensa." / "Plano ativo."),
  reaproveitando `Card`/`Badge` já usados na página.
- `/super-admin/tenants/[id]`: card de Status ganhou início/término do
  trial e dias restantes (com aviso "Expirando em breve" quando
  aplicável).

### Limitação real (arquitetural, não contornada)

Tenants `SUSPENDED`/`EXPIRED` têm `isActive=false`, e o `TenantGuard`
(inalterado) bloqueia **todo** acesso não-SUPER_ADMIN, inclusive o
login. Ou seja, o banner "Esta conta está suspensa"/"Período de
avaliação encerrado" descrito no pedido só é alcançável dentro do app
para `TRIAL`/`ACTIVE` — um usuário de tenant `SUSPENDED`/`EXPIRED` nunca
chega a ver uma tela do app, ele recebe a mensagem de erro do próprio
login (`"Esta empresa esta inativa. Entre em contato com o suporte."`,
já existente). Enfraquecer o `TenantGuard` para permitir login/leitura
num tenant inativo só para mostrar um banner mudaria uma garantia de
segurança já validada nas Fases 47/48 — fora do escopo pedido aqui
("preservar... RBAC; SUPER_ADMIN; enforcement da Fase 48").

## 8. Limitações reais

- Sem e-mail/WhatsApp/notificação — fora de escopo explícito desta fase.
- Sem cobrança/Stripe — fora de escopo explícito desta fase.
- Cron fixo (diário, 1h) — sem configuração via env var (não pedido;
  `TollDataSyncScheduler` tem isso porque precisa de liga/desliga
  externo para uma sincronização de terceiros, não é o caso aqui).
- Banner de lifecycle só alcançável para `TRIAL`/`ACTIVE` (ver seção 7).
