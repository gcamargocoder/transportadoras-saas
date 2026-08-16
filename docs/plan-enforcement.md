# Enforcement de Planos, Módulos e Limites (Fase 48)

Conecta a estrutura de plano criada na Fase 47 (`TenantPlan`,
`isModuleEnabled()`) aos fluxos reais do sistema. Até esta fase, planos e
limites existiam só como dado editável no `/super-admin` — nenhum
controller ou service respeitava isso. Nenhuma tabela/serviço/estrutura de
plano nova foi criada; tudo reaproveita o que já existia.

## 1. Módulos disponíveis e mapeamento

`TenantModule` (Fase 47, 9 valores) mapeado para os controllers já
existentes que correspondem a cada domínio:

| Módulo | Controllers gateados |
|---|---|
| `TRIPS` | `trips.controller.ts` |
| `TOLLS` | `toll-plazas`, `toll-transactions`, `toll-routes`, `toll-import`, `tag-providers` |
| `FUEL` | `fuel-supplies`, `fuel-stations` |
| `MAINTENANCE` | `fleet/maintenances`, `maintenance/maintenance-plans` |
| `TIRES` | `tires.controller.ts` |
| `CHECKLIST` | `checklists.controller.ts` (lado admin) |
| `STOPS` | `trip-operations/trip-stops.controller.ts` |
| `DASHBOARDS` | `dashboard.controller.ts`, `fleet-operations.controller.ts` |
| `REPORTS` | **não mapeado** — não existe `apps/api/src/reports/` nem controller correspondente hoje. Documentado aqui, nenhum comportamento inventado. |

**Não module-gated** (cadastro central, sem módulo correspondente no
enum, ou dado de referência de baixo risco): cadastro de veículos/
carretas/frotas/composições, motoristas, usuários, clientes, locais. Não
existe valor `FLEET` no enum `TenantModule` — o cadastro central de
veículos/motoristas é controlado apenas por **limite** (seção 3), nunca
por módulo.

**Limitação conhecida**: `driver-trips.controller.ts` (rotas do app do
motorista) não foi module-gateado nesta fase. Um único controller cobre
checklist + parada + abastecimento + evento de eixo do mesmo trajeto em
andamento — gatear por módulo arriscaria bloquear uma ação do meio de uma
viagem já iniciada. Fica como pendência real, não implementada.

## 2. Como o enforcement de módulo funciona

Mecanismo central único, nunca `if (!isModuleEnabled(...))` repetido:

- `@RequireModule(TenantModule.X)` — decorator novo
  (`tenants/decorators/require-module.decorator.ts`), aplicado a nível de
  classe nos controllers da tabela acima.
- `RequireModuleGuard` — guard global (`APP_GUARD`, registrado logo após
  `TenantGuard`). Sem o decorator, libera. Com o decorator: `SUPER_ADMIN`
  sempre libera; caso contrário, usa o `isModuleEnabled()` já existente da
  Fase 47 contra `request.tenant.plan`.
- `TenantGuard` passou a incluir `plan` na mesma query que já buscava o
  tenant (`include: { plan: true }`) — **zero query nova por
  requisição**, o guard de módulo só lê o que já está no request.

Bloqueio é sempre no backend. O frontend só reflete isso (esconder link de
menu, mostrar estado de erro) — nunca é a autoridade.

## 3. Limites

Aplicados via `assertUnderLimit()` + `runSerializable()`
(`tenants/utils/plan-limit.util.ts`), reaproveitado por
`UsersService.create`, `VehiclesService.create`, `DriversService.create`.

- Contagem do recurso do tenant + criação rodam dentro de **uma única
  transação Postgres `Serializable`**, nunca em passos separados — evita
  que duas criações concorrentes ultrapassem juntas o limite (provado por
  teste e2e com 2 requisições simultâneas contra 1 vaga livre).
- `limit == null` → sem limite (nunca bloqueia).
- `count >= limit` → `409 Conflict` com mensagem clara, nenhum registro
  criado.
- `UPDATE` de um recurso existente **nunca** consome o limite (só
  `create` conta).
- SUPER_ADMIN administrando um tenant nunca é bloqueado pelo limite do
  tenant administrado — o `tenantId` usado no enforcement já é sempre o
  do tenant alvo da operação, nunca o do tenant "casa" do SUPER_ADMIN.

### Armazenamento

Sem sistema de storage novo. `Attachment` e `ImportJob` (únicos dois
modelos com upload real hoje) ganharam campo aditivo `sizeBytes Int?`,
preenchido a partir do `Express.Multer.File.size` real no momento do
upload (`ChecklistExecutionsService.addEvidence`,
`TollImportService.create`). Uploads anteriores a esta fase ficam `NULL`
— excluídos da soma, nunca estimados.

Checagem: soma de `sizeBytes` não-nulos do tenant (Attachment + ImportJob)
+ tamanho do arquivo recebido, comparada a `plan.maxStorageMb`, dentro da
mesma transação Serializable do create. Se estourar: o arquivo (já
gravado em disco pelo multer antes do controller rodar) é apagado — nunca
fica persistido nem referenciado por um registro no banco.

## 4. Comportamento no limite (frontend)

`GET /tenants/me` (self-service, já existente) já retorna `plan` — o
hook novo `useTenantPlan()` (`hooks/use-tenant-plan.ts`) só reaproveita
essa mesma query (`['tenants', 'me']`), sem endpoint novo. Usado por:

- `sidebar-nav.tsx` — esconde itens de menu cujo módulo está desabilitado
  (`NavItem.module`, opcional). SUPER_ADMIN nunca tem itens escondidos.
- `LimitIndicator` (`components/ui/limit-indicator.tsx`) — "18 / 20
  utilizados" / "20 / 20 utilizados — Limite do plano atingido", usando
  `meta.total` das listagens já existentes + `plan.maxX`. Aplicado em
  `/vehicles`, `/settings/users`, `/drivers`.

Acesso direto por URL a uma rota de módulo desabilitado não é bloqueado
por um guard novo no cliente (autoridade é sempre o backend) — a página
recebe 403 do backend e mostra o mesmo `ErrorState` já usado para
qualquer outro erro de API.

## 5. SUPER_ADMIN

- Nunca bloqueado por módulo desabilitado, nem no próprio tenant "casa",
  nem administrando outro tenant.
- Nunca bloqueado pelo limite do tenant que administra.
- `/super-admin/tenants/[id]` (Fase 47, já existente) ganhou pequenas
  extensões: cada `StatCard` de uso com limite correspondente mostra
  "usado / limite", e um card novo de armazenamento (MB usados / limite)
  usando o `storageUsedMb` novo em `GET /tenants/:id/usage` (mesmo
  endpoint, campo aditivo). O editor de plano/módulos/limites em si já
  existia da Fase 47 e não mudou.

## 6. Códigos de erro

Sem campo `code` separado no envelope de erro — segue a convenção já
existente do projeto (`AllExceptionsFilter`: `error` = nome da exception,
`message` = texto). Mensagens centralizadas em
`tenants/constants/plan-error.constants.ts` (`PLAN_ERRORS`), mesmo padrão
de `AUTH_ERRORS`:

- `MODULE_DISABLED` → `ForbiddenException` (403).
- `USER_LIMIT_REACHED` / `VEHICLE_LIMIT_REACHED` / `DRIVER_LIMIT_REACHED`
  / `STORAGE_LIMIT_REACHED` → `ConflictException` (409), mesmo status já
  usado para duplicidade (e-mail/placa/CPF) na base.

## 7. Limitações reais

- `REPORTS` não tem controller correspondente — não mapeado.
- `driver-trips.controller.ts` (app do motorista) não foi module-gateado
  (ver seção 1).
- Controllers "de referência" das financeiras de viagem (receitas/
  despesas/adiantamentos) não foram module-gateados — não tinham
  correspondência 1:1 clara na tabela de mapeamento pedida; ficam
  acessíveis independente do módulo `TRIPS`.
- `EXPIRED`/expiração automática de trial continua manual (pendência já
  documentada desde a Fase 47, não é escopo desta fase).
