# Motoristas, Agregados e Terceiros (Fase 61)

Evolui o cadastro operacional de motoristas já existente (`Driver`, desde
as fases iniciais do projeto) para suportar corretamente motoristas
próprios, agregados e terceiros — sem criar um segundo cadastro paralelo,
sem quebrar viagens/financeiro/frota/fiscal/Driver App já existentes.

## 1. Escopo

| Recurso | Status |
|---|---|
| Classificação operacional (OWN/AGGREGATED/THIRD_PARTY) | ✅ campo novo em `Driver` |
| Status operacional detalhado (ACTIVE/INACTIVE/SUSPENDED) | ✅ campo novo, `isActive` legado mantido sincronizado |
| Bloqueio de nova viagem para motorista inativo/suspenso | ✅ reaproveitado (já existia via `isActive`) |
| Histórico de vínculo motorista ↔ veículo | ✅ tabela nova (`DriverVehicleAssignment`) |
| Indicadores por classificação/status | ✅ `GET /drivers/summary` |
| Documentos (CNH/MOPP/ANTT + fiscais) | ✅ 100% reaproveitado, nenhuma mudança de schema |
| Limite de plano (Fase 48) | ✅ reaproveitado sem alteração, nunca burlável por classificação |
| Folha de pagamento, comissão, pagamento automático, integração bancária/PIX/Stripe | ❌ fora de escopo (seção 19 do pedido) |
| Emissão fiscal, CIOT oficial, ANTT, GPS/telemetria/roteirização | ❌ fora de escopo |

## 2. Auditoria prévia (o que já existia vs. o que foi criado)

Antes de alterar qualquer coisa, o cadastro existente (`Driver`,
`apps/api/src/drivers/`) foi auditado por completo. Conclusões que
guiaram todas as decisões de design:

- **`Trip.driverId`** já é uma referência estática (FK) gravada no
  momento da criação da viagem — alterações posteriores no cadastro do
  motorista **nunca** alteram esse campo nem qualquer dado histórico da
  viagem (fiscal, comprovante de entrega, checklist, paradas,
  abastecimento, custos, faturamento, rentabilidade — todos leem o
  `driverId` da própria viagem, nunca "seguem" o cadastro do motorista em
  tempo real). Nenhuma mudança foi necessária para garantir isso — já era
  o comportamento correto.
- **`TripsService.assertDriverAvailable`** e a checagem de início de
  viagem **já bloqueavam** `driverId` com `isActive: false` antes desta
  fase. Nenhum código de `TripsService` foi alterado.
- **`DriverGuard`** (Driver App) **já bloqueava** `!driver.isActive`
  antes desta fase. Nenhuma linha do guard foi alterada.
- **`FiscalDocument.driverId`** já existia (Fase 52) — associação de
  documentos fiscais ao motorista já é nativa, nenhuma mudança de schema.
- **Limite de motoristas do plano** (`TenantPlan.maxDrivers`,
  `DriversService.create`, `assertUnderLimit`/`runSerializable`) já conta
  **todos** os motoristas (`deletedAt: null`), independente de qualquer
  classificação — nenhuma mudança de código foi necessária para impedir
  bypass por tipo.
- **Não existia** nenhum campo de status tipado (só `isActive: boolean`),
  nenhuma classificação, e nenhum vínculo motorista↔veículo (nem mesmo em
  `DriverShift`, que é sobre jornada de trabalho, não veículo).

Essa auditoria evitou reescrever qualquer um dos pontos acima — a
estratégia foi **sincronizar** o novo campo `status` com o campo
`isActive` já lido em todos esses lugares, em vez de duplicar a lógica de
bloqueio.

## 3. Modelagem (migration aditiva)

2 enums + 3 campos novos em `Driver` (nenhuma coluna removida) + 1 tabela
nova:

```prisma
enum DriverType { OWN AGGREGATED THIRD_PARTY }
enum DriverStatus { ACTIVE INACTIVE SUSPENDED }

model Driver {
  // ... campos ja existentes, inalterados ...
  type        DriverType   @default(OWN)
  status      DriverStatus @default(ACTIVE)
  isAvailable Boolean      @default(true)
  isActive    Boolean      @default(true) // mantido, sincronizado com status
}

model DriverVehicleAssignment {
  id, tenantId, driverId, vehicleId
  startedAt DateTime
  endedAt   DateTime? // null = vinculo atual
  notes, createdBy, createdAt
}
```

**Data migration** (dentro da própria migration SQL): motoristas já
cadastrados com `is_active = false` recebem `status = INACTIVE` (nunca o
`ACTIVE` default) — preserva o estado real de todos os motoristas
existentes. Nenhum motorista é reclassificado para `SUSPENDED`
automaticamente (não há como inferir suspensão retroativa a partir de um
booleano).

### 3.1 Por que `isActive` foi mantido (nunca removido)

`isActive` é lido diretamente (sem passar pelo `DriversService`) em pelo
menos 2 lugares críticos: `TripsService.assertDriverAvailable`/checagem
de início de viagem, e `DriverGuard` do Driver App. Removê-lo exigiria
alterar código já testado e em produção fora do escopo desta fase. Em vez
disso, `DriversService.updateStatus`/`create`/`softDelete` **sempre**
gravam `isActive = (status === ACTIVE)` na mesma escrita — a partir desta
fase, `status` é a fonte de verdade e `isActive` é um espelho derivado,
nunca editado independentemente. Isso significa que um motorista
`SUSPENDED` fica automaticamente bloqueado para nova viagem e para o
Driver App **sem nenhuma mudança nesses dois pontos** — comprovado por
testes e2e dedicados (seção 8).

### 3.2 Histórico de vínculo com veículo

Mesmo espírito do padrão já usado no projeto para "vínculo atual +
histórico" (`Tire`/`TireMovement`, Fase 45): a linha **atual** é a que
tem `endedAt` nulo (no máximo 1 por motorista, garantido pelo
`DriversService` em uma transação, nunca por constraint de banco — mesmo
nível de garantia já aceito para `TollRate`/`FreightRule`). Trocar de
veículo fecha a linha atual (`endedAt = agora`) e abre uma nova, **nunca
apaga** a anterior. `Trip`/`TripComposition` já registradas nunca são
alteradas por uma troca de veículo do motorista.

## 4. Status operacional

| Status | Efeito |
|---|---|
| `ACTIVE` | Normal — pode ser atribuído a novas viagens, acessa o Driver App. |
| `INACTIVE` | Vínculo encerrado — bloqueado para nova viagem e Driver App (via `isActive=false`). |
| `SUSPENDED` | Bloqueio temporário/disciplinar — mesmo bloqueio de `INACTIVE` (via `isActive=false`), mas semanticamente distinto e reversível a qualquer momento. |

Transição sempre via `PATCH /drivers/:id/status`. Cada transição gera uma
ação de auditoria distinta (`driver.reactivated`/`driver.suspended`/
`driver.deactivated`), calculada por uma função pura testada
isoladamente (`resolveDriverStatusChangeAction`,
`drivers/utils/driver-status-transition.util.ts`).

Viagens **históricas** de um motorista suspenso/desativado continuam
100% acessíveis e inalteradas — testado explicitamente
(`driver-management.e2e-spec.ts`).

## 5. Classificação operacional

`type: DriverType` — `OWN` (próprio), `AGGREGATED` (agregado, vínculo
operacional com relação contratual própria) ou `THIRD_PARTY` (terceiro,
serviço externo). Default `OWN` em todo motorista já existente
(compatibilidade preservada). Alterar a classificação via `PATCH
/drivers/:id` audita `driver.classification_changed` (distinto do
`driver.updated` genérico).

### 5.1 Estrutura contratual mínima (AGGREGATED/THIRD_PARTY)

O pedido desta fase exigia "estrutura mínima necessária para registrar a
relação operacional/contratual" para agregados/terceiros, reaproveitando
estrutura de contratos/pagamentos se existisse uma aplicável. O `Contract`
já existente (Fase 59) é especificamente o contrato comercial de frete
com um **cliente** (`customerId`) — reaproveitá-lo para a relação
motorista↔transportadora misturaria dois domínios diferentes e
corromperia sua semântica, então **não foi reaproveitado**. Em vez de
criar uma tabela de contrato paralela, os campos **já existentes**
`admissionDate`/`terminationDate`/`notes` (que já significam exatamente
"início do vínculo"/"encerramento do vínculo"/"observações") foram
reaproveitados como a estrutura mínima para qualquer classificação —
nenhum campo novo de "data de início/fim de vínculo" foi criado, pois já
existia. Isso deixa a arquitetura aberta para uma fase futura dedicada a
contratos/pagamentos de agregados/terceiros, sem nenhuma migração
retroativa necessária.

## 6. Relação motorista ↔ veículo

`GET /drivers/:id/vehicle-assignments` — histórico completo (mais
recente primeiro). `POST /drivers/:id/vehicle-assignments` — vincula um
veículo (fecha o vínculo atual se existir, abre um novo). `POST
/drivers/:id/vehicle-assignments/end` — encerra o vínculo atual sem abrir
um novo. `DriverEntity.currentVehicleId`/`currentVehiclePlate` resolvidos
em lote (1 query extra, nunca 1 por motorista) tanto na listagem quanto
no detalhe.

## 7. Relação motorista ↔ viagem (reaproveitada, não alterada)

`Trip.driverId` continua sendo a única fonte de verdade de "qual
motorista executou esta viagem" — uma FK estática, nunca um vínculo "ao
vivo". Verificado explicitamente que fiscal, comprovante de entrega,
checklist, paradas, abastecimento, custos, faturamento e rentabilidade
**todos** leem esse mesmo `driverId` da viagem (nunca o cadastro atual do
motorista) — nenhuma dessas fases precisou de qualquer alteração.

## 8. Driver App

**Nenhuma mudança de código** no Driver App nem no `DriverGuard` — a
sincronização `isActive = (status === ACTIVE)` (seção 3.1) é suficiente
para bloquear automaticamente o acesso de um motorista `SUSPENDED`/
`INACTIVE`, comprovado por 3 novos testes e2e em
`driver-trips.e2e-spec.ts` ("Fase 61 -- status operacional bloqueia o
Driver App"): suspensão bloqueia `GET /driver/trips/active` (403),
desativação bloqueia da mesma forma, e reativação devolve o acesso.
`syncQueue`/`deviceEventId`/retry/idempotência do app permanecem
intocados.

## 9. Permissões

Mesmo RBAC já existente (`DRIVER_READ_ROLES`/`DRIVER_WRITE_ROLES`,
back e frontend, inalterados): `SUPER_ADMIN`/`ADMIN`/`MANAGER`/
`OPERATOR`/`DISPATCHER` escrevem, `AUDITOR` só lê, `DRIVER` (role de
login) nunca acessa o módulo administrativo — só acessa suas próprias
viagens via `driver-trips`, que já era assim antes desta fase, sem
alteração. `SUPER_ADMIN` nunca recebe acesso operacional adicional só por
ser `SUPER_ADMIN` — usa o mesmo `DRIVER_WRITE_ROLES` de qualquer outro
administrador.

## 10. Limite de plano (Fase 48, reaproveitado sem alteração)

`assertUnderLimit`/`runSerializable`/`TenantPlan.maxDrivers` contam
**todos** os motoristas (`deletedAt: null`), somados através de
`OWN`+`AGGREGATED`+`THIRD_PARTY` — testado explicitamente que a
classificação nunca burla o limite (criar um motorista `AGGREGATED`
depois do limite já atingido por um `OWN` continua bloqueado, 409).

## 11. API

| Rota | Descrição |
|---|---|
| `GET /drivers` | Lista (ganhou filtros `type`/`status`, além dos já existentes). |
| `GET /drivers/summary` | **Novo** — indicadores por classificação/status. |
| `GET /drivers/:id` | Detalhe (ganhou `type`/`status`/`isAvailable`/`currentVehicleId`/`currentVehiclePlate`). |
| `POST /drivers` | Cadastro (ganhou `type?`/`isAvailable?` opcionais). |
| `PATCH /drivers/:id` | Atualização (ganhou `type?`/`isAvailable?`; muda a classificação audita `driver.classification_changed`). |
| `PATCH /drivers/:id/status` | **Alterado** — antes `{isActive: boolean}`, agora `{status: DriverStatus}` (ACTIVE/INACTIVE/SUSPENDED). |
| `DELETE /drivers/:id` | Exclusão lógica (inalterada; agora também grava `status: INACTIVE`). |
| `GET /drivers/:id/vehicle-assignments` | **Novo** — histórico de vínculo com veículo. |
| `POST /drivers/:id/vehicle-assignments` | **Novo** — vincula veículo (fecha o atual, abre um novo). |
| `POST /drivers/:id/vehicle-assignments/end` | **Novo** — encerra o vínculo atual. |
| `GET /drivers/:id/documents`, `POST /drivers/:id/documents` | Inalterados (Document genérico, CNH/MOPP/ANTT). |
| `GET /fiscal/documents?driverId=...` | Reaproveitado (Fase 52) para documentos fiscais do motorista, nenhuma rota nova. |
| `GET /trips?driverId=...` | Reaproveitado para "viagens recentes" do motorista, nenhuma rota nova. |

**Mudança de contrato**: `PATCH /drivers/:id/status` deixou de aceitar
`{isActive: boolean}` e passou a exigir `{status: DriverStatus}`. Todos
os chamadores (testes e2e pré-existentes em `drivers.e2e-spec.ts` e
`trips.e2e-spec.ts`) foram atualizados para o novo formato dentro desta
mesma fase — não há nenhum consumidor externo deste contrato.

## 12. Performance (sem N+1)

- `GET /drivers` resolve o veículo atual de todos os motoristas da página
  em **1 única query** (`DriverVehicleAssignment.findMany({driverId: {in:
  [...]}, endedAt: null})`), nunca 1 por linha.
- `GET /drivers/summary` usa **2 `groupBy` em paralelo** (por `type`, por
  `status`), independente da quantidade de motoristas do tenant.
- `GET /drivers/:id/vehicle-assignments` é 1 única query com `include` do
  veículo e do criador.

## 13. Testes

- **Unitário** (`driver-status-transition.util.spec.ts`, 7 testes):
  nomeação da ação de auditoria por transição (reactivated/suspended/
  deactivated/updated) e `isDriverAssignableToTrip` (só `ACTIVE`).
- **E2e** (`driver-management.e2e-spec.ts`, 15 testes, novo arquivo):
  classificação OWN/AGGREGATED/THIRD_PARTY, alteração de classificação
  auditada, suspensão/reativação/desativação auditadas distintamente,
  bloqueio de nova viagem para SUSPENDED/INACTIVE, viagem histórica
  preservada após suspensão, vínculo/troca/encerramento de veículo com
  histórico completo, indicadores (`summary`), limite de plano nunca
  burlado por classificação, isolamento multi-tenant, RBAC.
- **E2e** (`driver-trips.e2e-spec.ts`, +3 testes): Driver App bloqueado
  para SUSPENDED/INACTIVE, liberado novamente após reativação.
- **Regressão**: `drivers.e2e-spec.ts` (3 chamadas atualizadas para o
  novo formato de `PATCH .../status`), `trips.e2e-spec.ts` (1 chamada
  atualizada), `plan-enforcement.e2e-spec.ts`, `fleet.e2e-spec.ts` — todos
  100% passando após as atualizações. **114 testes** nos 5 arquivos
  diretamente relacionados (drivers/trips/driver-trips/driver-management/
  plan-enforcement), **34/34** em `fleet.e2e-spec.ts`. 552/552 testes
  unitários da API (63 suítes), 200/200 testes do admin-web (34 arquivos).
- **Flakiness identificada e isolada**: `fleet.e2e-spec.ts` › "CRUD
  completo de frota" excedeu o timeout padrão de 5s do Jest quando
  executado em sequência com outras suítes pesadas (carga do sistema) —
  reproduzido isoladamente (`-t "CRUD completo de frota"`), completou em
  ~1s, e a suíte completa voltou a passar 34/34 na sequência seguinte.
  Confirmado como flakiness de timing pré-existente, não relacionada às
  mudanças desta fase (nenhum código do módulo `fleet` foi alterado,
  apenas uma relação reversa nova foi adicionada ao `Vehicle` no schema).

## 14. Limitações reais / fora de escopo (declarado)

- Nenhuma folha de pagamento, comissão, pagamento automático, integração
  bancária, PIX, Stripe, emissão fiscal, CIOT oficial, integração ANTT,
  GPS/telemetria ou roteirização foi implementada — fora de escopo desta
  fase (seção 19 do pedido).
- `isAvailable` (disponibilidade operacional) é **sempre manual** — nunca
  inferido automaticamente a partir de viagens em andamento (evita uma
  heurística não pedida).
- Não há lock otimista na atribuição de veículo (`assignVehicle` faz
  check-then-act dentro de uma transação Prisma) — mesmo nível de garantia
  já aceito no restante do projeto para vínculos "atual + histórico"
  (`TollRate`/`FreightRule`/`ChecklistTemplate`), nenhuma solução nova de
  concorrência foi criada especificamente para este caso.
- Estrutura contratual de agregados/terceiros é deliberadamente mínima
  (seção 5.1) — uma fase futura dedicada a contratos/pagamentos de
  agregados/terceiros pode evoluir isso sem exigir migração retroativa.
