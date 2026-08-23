# Centro de Alertas, Notificações e Ações Operacionais (Fase 69, estendido na Fase 70)

## Escopo

Transforma os alertas operacionais já existentes e dispersos (`FleetAlert`,
`TripOccurrence`, status de `Vehicle`/`Driver`, manutenção, pneus,
combustível, fiscal, faturamento, comprovante de entrega) em um centro
interno de notificações lidas/não-lidas por usuário. **Sem push**
(Firebase/Expo/OneSignal/Web Push/SMS/WhatsApp/e-mail automático) — essa
camada fica para uma fase futura, deliberadamente fora do escopo pedido.

**Fase 70** fechou as 3 pendências reais deixadas pela Fase 69: tela
`NotificationsScreen` no Driver App, notificações de comprovante de
entrega (`DELIVERY_PROOF_PENDING`/`DELIVERY_PROOF_PROBLEM`) e
processamento periódico em background (a geração deixou de acontecer no
caminho síncrono de `GET /notifications`/`GET /notifications/unread-count`).

## Auditoria prévia (o que já existia vs. o que foi ativado)

- `Notification` (model): confirmado **100% órfão** (zero uso em qualquer
  service/controller) — diferente de `Alert`, que é **ativo** (usado por
  `RoutingService.checkDeviation`, `TripsService`, `FleetOperationsMetricsService`
  para `openAlerts`). `Notification.alertId` era uma FK obrigatória para
  `Alert`, com `channel`/`status`/`sentAt` desenhados para rastrear entrega
  por canal externo — semântica diferente da pedida nesta fase (centro
  interno de leitura, apontando para qualquer entidade, não só `Alert`).
- Decisão: **ativar e ajustar o mínimo necessário** o model `Notification`
  existente (não criar um segundo model). `alertId`/`channel`/`status`/
  `sentAt` viram opcionais e **nunca são preenchidos** — ficam preservados
  para uma fase futura de entrega por canal externo, nunca removidos nem
  reaproveitados com outro significado.
- `FleetAlert`: **não duplicado**. As mesmas condições que já geram
  `TRIP_OCCURRENCE_CRITICAL`/`VEHICLE_MAINTENANCE_OVERDUE`/etc. (Fases
  67-68) são reconsultadas com os **mesmos critérios** para gerar
  `Notification` — nenhuma segunda lógica de detecção, nenhuma nova
  máquina de estados.
- Fase 70 — auditoria de infraestrutura de job/cron: `@nestjs/schedule` +
  `cron` já estavam instalados e em uso por 3 schedulers
  (`TenantLifecycleScheduler`, `BillingLifecycleScheduler` via `@Cron`
  estático; `TollDataSyncScheduler` via `SchedulerRegistry`/`CronJob`
  dinâmico registrado em `OnModuleInit`, quando a expressão/liga-desliga
  vem de env var). **Reaproveitado o padrão dinâmico** (mesma necessidade:
  cron configurável por env var) — nenhuma infraestrutura nova instalada,
  nenhum Redis/BullMQ/RabbitMQ/microserviço.
- Fase 70 — auditoria de `computeDeliveryProofStatus`
  (`fiscal/utils/trip-compliance.util.ts`): confirmado que
  `completenessAvailable` é **sempre `false`** (não há regra de
  "documento obrigatório" configurada em nenhum lugar do sistema — ver
  Fase 54). Por isso `DELIVERY_PROOF_PENDING` **nunca** significa
  "comprovante ausente" (isso exigiria inventar uma regra de
  obrigatoriedade) — significa "comprovante **já enviado**, aguardando
  revisão" (`FiscalDocument.status = PENDING` de um documento
  `DELIVERY_PROOF`), o único dado real e objetivo disponível hoje.

## 1. Modelo conceitual

- **Alerta operacional** = condição derivada (ex: `TripOccurrence` crítica
  aberta) — continua vivendo só na tabela de origem, nunca duplicada.
- **Notificação** = registro em `Notification`, apontando para a origem
  via `entityType`/`entityId` (+ `metadata` mínimo para navegação, ex.
  `{tripId}`/`{vehicleId}` quando `entityId` sozinho não é "abrível" numa
  rota existente).
- **Reconhecimento** = `readAt` preenchido pelo próprio destinatário.
- **Resolução** = a condição de origem deixou de existir (ex:
  `TripOccurrence.resolvedAt` preenchido) — a notificação **nunca é
  apagada**, permanece histórica.

## 2. `Notification` (schema)

```
id, tenantId, recipientId, type (NotificationType), title, message,
severity (AlertSeverity, reaproveitado), entityType, entityId,
metadata (Json?), readAt, createdAt
-- legado, nunca preenchido:
alertId?, channel?, status?, sentAt?
```

Dedup: `@@unique([tenantId, recipientId, type, entityType, entityId])` —
o mesmo alerta processado 2x (inclusive em execuções concorrentes do job)
nunca gera uma segunda notificação lógica para o mesmo destinatário
(geração via `createMany({skipDuplicates:true})`, nunca um
`findFirst`-then-`create` por notificação — essa constraint de banco é a
**única** barreira real contra duplicação).

## 3. Tipos (`NotificationType`)

| Tipo | Fonte (mesmo critério de FleetAlert/dashboards já existentes) | Destinatário |
|---|---|---|
| `CRITICAL_OCCURRENCE` | `TripOccurrence` severity=CRITICAL, status OPEN (mesma de `TRIP_OCCURRENCE_CRITICAL`, Fase 68) | grupo operacional |
| `VEHICLE_UNAVAILABLE` | `Vehicle.status` IN (SUSPENDED, MAINTENANCE) | grupo operacional |
| `VEHICLE_MAINTENANCE` | `VehicleMaintenance` aberta com `scheduledAt` vencido (mesma de `VEHICLE_MAINTENANCE_OVERDUE`) | grupo operacional |
| `TIRE_NEAR_REPLACEMENT` | `Tire.currentTreadDepthMm` ≤ `NEAR_REPLACEMENT_THRESHOLD_MM` (mesma constante do módulo de pneus) | grupo operacional |
| `FUEL_ODOMETER_REGRESSION` | `detectOdometerRegression` (mesma função pura já usada no dashboard/overview) | grupo operacional |
| `FISCAL_DOCUMENT_PROBLEM` | `FiscalDocument.status = INVALID` (ver limitação abaixo) | grupo operacional |
| `TRIP_DELAYED` | Viagem não-terminal com `plannedArrival` no passado (mesmo critério do KPI `delayedTrips`) | grupo operacional |
| `DRIVER_SUSPENDED` / `DRIVER_INACTIVE` | `Driver.status` | grupo de gestão (mais restrito) |
| `BILLING_PENDING` | `TripBilling.status` IN (READY, PARTIALLY_INVOICED) (mesmo critério de `BillingDashboardEntity.pendingCount`) | grupo de gestão |
| `DELIVERY_PROOF_PENDING` **(Fase 70)** | `FiscalDocument.documentType=DELIVERY_PROOF`, `status=PENDING`, `tripId` presente — comprovante já enviado, aguardando revisão | grupo operacional **+ motorista da viagem** |
| `DELIVERY_PROOF_PROBLEM` **(Fase 70)** | mesmo documento, `status` IN (INVALID, CANCELLED) — mesma classificação PROBLEMATIC de `computeDeliveryProofStatus`, aplicada ao campo persistido | grupo operacional **+ motorista da viagem** |

`DELIVERY_PROOF_PENDING`/`DELIVERY_PROOF_PROBLEM` são os **únicos 2 tipos**
com um motorista como destinatário direto até agora (ver seção 5).

## 4. Geração — processamento periódico em background (Fase 70)

Até a Fase 69, a geração acontecia sincronamente dentro de
`GET /notifications`/`GET /notifications/unread-count`. **A partir da
Fase 70, isso não acontece mais**: essas duas rotas são leitura pura
(`findMany`/`count` direto na tabela `Notification`, usando o índice
`(recipientId, readAt)`) — nunca disparam geração.

A geração vira responsabilidade de `NotificationsService.processTenant(tenantId)`:

1. 12 "coletores" (1 query cada — os 10 da Fase 69 + os 2 de comprovante
   de entrega da Fase 70, todos em `Promise.all`) buscam as condições
   ativas do tenant, escopadas a uma **janela operacional aberta**
   (nunca todo o histórico — ex: ocorrência ainda `OPEN`, manutenção
   ainda não `COMPLETED`/`CANCELLED`, documento fiscal ainda no status
   relevante).
2. Os tipos presentes determinam os roles elegíveis
   (`NOTIFICATION_RECIPIENT_ROLES`) — **1 única query** busca todos os
   usuários candidatos por role (`role IN (...)`, `isActive=true`).
3. Cada candidato pode também trazer `directRecipientIds` (ex: o
   motorista da própria viagem) — união em memória com os destinatários
   por role, nunca uma segunda query por candidato.
4. **1 único** `createMany({skipDuplicates:true})` grava tudo de uma vez.

Nunca 1 query por notificação/candidato/destinatário — número de queries
fixo por tenant, independente do volume de condições (comprovado com 10
vs. 50 condições, ver seção 11).

Dois pontos de entrada chamam `processTenant`/o equivalente multi-tenant:

- **Job agendado** (`NotificationsProcessingScheduler`) — reaproveita o
  padrão dinâmico já usado por `TollDataSyncScheduler`
  (`SchedulerRegistry`/`CronJob` registrado em `OnModuleInit`, cron
  configurável por env var). Chama `NotificationsService.processAllTenants()`,
  que itera os tenants **ativos** **sequencialmente** (nunca em paralelo —
  mesmo princípio de `TollDataSyncScheduler`, evita sobrecarregar o pool
  de conexões) e roda `processTenant` para cada um. Configurável via:
  - `NOTIFICATIONS_PROCESS_ENABLED` (default `true` — diferente de
    `TollDataSyncScheduler`, que é `false` por padrão porque faz chamada
    de rede externa; este job só faz leitura/escrita interna idempotente,
    seguro ligado por padrão).
  - `NOTIFICATIONS_PROCESS_CRON` (default `*/5 * * * *`, ou seja, a cada
    5 minutos).
- **Gatilho manual** `POST /notifications/process` — tenant-escopado
  (nunca dispara o scan global entre tenants), idempotente, útil para
  operação ("gerar agora") e para testes determinísticos.

## 5. Destinatários (RBAC + destinatário direto)

`NOTIFICATION_RECIPIENT_ROLES` (`notifications/constants/`):
`CRITICAL_OCCURRENCE`/`VEHICLE_UNAVAILABLE`/`VEHICLE_MAINTENANCE`/
`TIRE_NEAR_REPLACEMENT`/`FUEL_ODOMETER_REGRESSION`/`FISCAL_DOCUMENT_PROBLEM`/
`TRIP_DELAYED`/`DELIVERY_PROOF_PENDING`/`DELIVERY_PROOF_PROBLEM` →
`SUPER_ADMIN, ADMIN, MANAGER, OPERATOR, DISPATCHER`.
`DRIVER_SUSPENDED`/`DRIVER_INACTIVE`/`BILLING_PENDING` → `SUPER_ADMIN, ADMIN, MANAGER`
(mais restrito — gestão de pessoas/financeiro). `AUDITOR` **nunca**
aparece (notificação implica ação necessária; auditor é só leitura).

`DRIVER` nunca aparece nesse mapa **por role** — nenhum tipo é "para todo
usuário com role motorista". A partir da Fase 70,
`DELIVERY_PROOF_PENDING`/`DELIVERY_PROOF_PROBLEM` endereçam o **motorista
específico da viagem** por um mecanismo separado e direto
(`NotificationCandidate.directRecipientIds`, resolvido em
`directRecipientFromDriver`): só quando `Driver.userAccountId` existe e
`Driver.isActive=true` (mesmo critério de autorização do `DriverGuard`) —
nunca "todos os motoristas", nunca um motorista sem login no app ou
desativado.

## 6. APIs

- `GET /notifications` — paginada, filtros `unread`/`type`/`severity`/`entityType`/`from`/`to`. Leitura pura.
- `GET /notifications/unread-count` — `{total, critical}`. Leitura pura (Fase 70: nunca gera).
- `GET /notifications/:id`
- `PATCH /notifications/:id/read` — idempotente.
- `PATCH /notifications/read-all` — idempotente.
- `POST /notifications/process` **(Fase 70)** — gera agora as notificações
  pendentes do tenant autenticado (mesmo processamento do job periódico,
  escopado a este tenant). Idempotente.

Sem `archive`: `readAt` já representa o comportamento pedido, um segundo
status seria redundante. Sem `@Roles` no controller: **todo** usuário
autenticado vê só as **próprias** notificações — `recipientId = usuário
autenticado` é aplicado no `WHERE` do service (nunca só no controller),
então trocar o `:id` na URL para o de outro usuário sempre resulta 404
(nunca vaza a existência do registro).

Driver App: `GET /driver/notifications`, `GET /driver/notifications/unread-count`,
`PATCH /driver/notifications/:id/read` — **mesmo** `NotificationsService`
reaproveitado dentro de `DriverTripsController` (nenhum service/mecanismo
paralelo, nenhum endpoint duplicado criado nesta fase). Antes da Fase 70
devolvia sempre vazio para o motorista; a partir de agora devolve
`DELIVERY_PROOF_PENDING`/`DELIVERY_PROOF_PROBLEM` quando o motorista é o
responsável pela viagem — os demais 10 tipos continuam nunca aparecendo
(mesmo isolamento `recipientId = usuário autenticado` do endpoint
administrativo, não há necessidade de filtro extra por role).

## 7. Frontend (admin-web)

- `/notifications` (grupo "Visão geral" da navegação, sem restrição de
  role/módulo — mesmo critério do backend). Filtros (status/severidade/
  tipo/período — as opções de tipo vêm de `NOTIFICATION_TYPE_LABELS`,
  então os 2 tipos da Fase 70 aparecem automaticamente, sem alterar
  layout), tabela com badge de severidade, "Marcar todas como lidas",
  clique na linha marca como lida e navega para a origem
  (`resolveNotificationLink` — só rotas que **realmente existem**:
  `/trips/:id` (inclui `DELIVERY_PROOF_PENDING`/`PROBLEM`, via
  `entityType='FiscalDocument'` + `metadata.tripId`, mesmo caminho já
  usado por `FISCAL_DOCUMENT_PROBLEM`), `/vehicles/:id`, `/tires/:id`,
  `/drivers/:id`, `/operations/fleet/fiscal`, `/operations/fleet/billing`;
  retorna `null` quando não há uma tela dedicada para aquela origem).
- Sino com contador de não lidas no `Header` (topo, ao lado do menu de
  usuário), com polling leve de 60s (sem push, é só refresh do contador).

Nenhum dashboard novo criado na Fase 70 — os indicadores de
comprovante de entrega pendente/problemático já existem nos módulos
fiscal/operacional (Fase 54-56); a única superfície nova é o centro de
notificações em si.

## 8. Driver App (Fase 70)

- `NotificationsScreen` (`apps/driver-app/src/screens/NotificationsScreen.tsx`):
  lista as notificações do motorista (reaproveita
  `GET /driver/notifications`), toque marca como lida
  (`PATCH /driver/notifications/:id/read`) e navega para a origem quando
  possível — hoje só `DELIVERY_PROOF_PENDING`/`PROBLEM`
  (`entityType='FiscalDocument'` + `metadata.tripId`) navegam para a
  `DeliveryProofScreen` já existente (Fase 56); qualquer outro
  `entityType` (não deveria ocorrer hoje, mas o app não trava se um tipo
  futuro passar a incluir `DRIVER`) só marca como lida, **nunca** navega
  para uma rota inventada.
- Entrada na `HomeScreen`: botão "Notificações" com contador de não lidas
  (`GET /driver/notifications/unread-count`), carregado ao abrir a tela e
  atualizado a cada pull-to-refresh — sem push, não há como saber de uma
  notificação nova sem o usuário reabrir/puxar a tela.
- Leitura é sempre **online** — sem cache/fila offline complexa; falha de
  rede mostra um estado de indisponibilidade (nunca apaga notificações já
  carregadas), sem sincronização offline de leitura (fora do escopo
  pedido).
- Sem push, sem som, sem vibração.

## 9. Auditoria

`AuditService.log` para `notification.read` e `notification.read_all` —
nunca GET/listagem/processamento. Nenhum segundo sistema de auditoria.

## 10. Testes

- Unit (backend): `notification-recipients.util.spec.ts` (classificação
  de destinatários por tipo, exclusão de AUDITOR/DRIVER — incluindo os 2
  tipos da Fase 70 — tipos restritos sem OPERATOR/DISPATCHER);
  `notifications.service.spec.ts` **(Fase 70, novo)** — `PrismaService`
  totalmente mockado: `DELIVERY_PROOF_PENDING`/`PROBLEM` (com/sem
  motorista elegível como destinatário direto), união de destinatários
  (role + direto, sem duplicar), `createMany({skipDuplicates:true})`
  (nunca `findFirst`-then-`create`), `processAllTenants` (isola falha por
  tenant, só tenants ativos), leitura pura de `getUnreadCount`/
  `findAllForUser` (nunca chamam geração), janela de processamento
  (filtros `where` das queries de manutenção/viagem/ocorrência).
- Unit (admin-web): `notification-links.test.ts` (resolução de rota de
  origem, incluindo os 2 tipos da Fase 70, nunca inventa URL).
- E2E (`test/notifications.e2e-spec.ts`, 23 casos): geração via
  `POST /notifications/process` + listagem, paginação, filtros,
  unread-count **nunca gera** (Fase 70), read/read-all idempotentes,
  deduplicação (2x processamento → 1 notificação; resolver origem não
  duplica nem apaga histórico), isolamento multi-tenant, isolamento por
  usuário (troca de id na URL → 404), integração com manutenção/veículo/
  fiscal/comprovante de entrega (pending/problem/nunca para VALID),
  Driver App (recebe os 2 tipos da Fase 70, nunca os administrativos,
  isolamento motorista A/B), job (`processAllTenants` multi-tenant,
  idempotente entre execuções), e verificação real de ausência de N+1
  (10→50 condições no processamento, e contagem constante em
  `GET /notifications/unread-count` independente do volume de
  notificações já existentes).
- Regressão confirmada verde (Fase 70): suíte unitária completa da API;
  `driver-trips`/`fiscal-documents`/`trips`/
  `trip-occurrences-shifts-timeline`/`vehicle-management`/
  `fleet-maintenance`/`maintenances`/`maintenance-vehicle-integration`/
  `tire-management`/`tire-vehicle-integration`/`fuel-management`/
  `fuel-vehicle-integration`/`freight`/`billing`/`billing-operational`/
  `trip-finance`/`fleet-operations` (+ variantes compositions/financial/
  fuel/tires/vehicles) — 427/428 e2e verdes; 1 falha isolada
  (`fleet-operations-downtime-cost.e2e-spec.ts`, timeout de 5s do Jest
  num teste com setup de dados pesado, também falha isoladamente fora
  desta fase, nenhuma relação com notificações — pré-existente, não
  mascarada); suíte completa do driver-app (Jest, 107/107) e admin-web
  (Vitest); typecheck/build de `apps/api`, `apps/admin-web` e
  `apps/driver-app`.

## 11. Performance / N+1

Processamento (`POST /notifications/process`/job): número fixo de
queries (12 coletores + 1 de destinatários + 1 `createMany`), nunca por
condição/notificação/destinatário — comprovado com 10 vs. 50 condições.
`processAllTenants`: cresce com o número de **tenants** (esperado, é um
job de background varrendo a base inteira), nunca com o número de
condições/notificações dentro de um tenant. Listagem/unread-count:
`findMany`/`count` paginados no banco, índice `(recipientId, readAt)`
dedicado — comprovado O(1) independente do volume de notificações já
existentes (Fase 70).

## 12. Limitações reais

- `FISCAL_DOCUMENT_PROBLEM`/`DELIVERY_PROOF_PROBLEM` usam
  `FiscalDocument.status IN (INVALID, CANCELLED)` (campo já persistido)
  em vez de recomputar `classifyFiscalDocumentIssues` (validação
  estrutural completa) para todos os documentos do tenant a cada
  processamento — simplificação deliberada por custo, documentada desde
  a Fase 69 e mantida na Fase 70.
- `DELIVERY_PROOF_PENDING` significa "comprovante enviado, aguardando
  revisão" (`FiscalDocumentStatus.PENDING`), **nunca** "comprovante
  ausente" — a Fase 54 documenta que não há regra de obrigatoriedade de
  documento configurada em nenhum lugar do sistema
  (`completenessAvailable` sempre `false`); inventar essa regra estaria
  fora do escopo desta fase.
- Job com intervalo mínimo de 5 minutos (`NOTIFICATIONS_PROCESS_CRON`,
  configurável) — uma condição pode levar até esse intervalo para virar
  notificação sem o gatilho manual `POST /notifications/process`.
- Sem push/e-mail/SMS/WhatsApp — deliberado (ver Escopo).
- Driver App: leitura de notificações é só online, sem fila/sincronização
  offline — deliberado (ver seção 8).

## 13. Pendências reais

Nenhuma pendência real conhecida ao final da Fase 70 para o escopo
pedido (as 3 pendências herdadas da Fase 69 — tela no Driver App,
notificações de comprovante de entrega, processamento em background —
foram fechadas). Possíveis evoluções futuras, fora do escopo desta fase:
push/e-mail, geração de `DELIVERY_PROOF_PROBLEM`/`FISCAL_DOCUMENT_PROBLEM`
a partir da classificação estrutural completa em vez do campo `status`, e
uma regra de obrigatoriedade de documento configurável (pré-requisito
para um eventual `DELIVERY_PROOF_MISSING`, hoje impossível de implementar
honestamente).
