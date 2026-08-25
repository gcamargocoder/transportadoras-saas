# Oficinas e Fornecedores (Fase 84)

## 1. Auditoria prévia

Antes de qualquer código, o schema completo, `VehicleMaintenance.workshop`/`supplier`
(texto livre, Fase 13), `TripExpense.supplier` (texto livre) e `Payable.supplierName`
(snapshot, Fase 73/79), e os módulos `FuelStation` (Fase 18) e `TagProvider` (Fase 6) foram
auditados.

**Achados**:
- **Não existia** nenhuma entidade estruturada de oficina/fornecedor. `VehicleMaintenance`
  já tinha `workshop`/`supplier` como texto livre desde a Fase 13 — nunca uma FK.
- **`Payable.supplierName`** (Fase 73) tem um comentário explícito no schema: *"o projeto não
  possui um model Supplier estruturado, então nunca inventamos uma relação"*. Essa afirmação
  deixa de ser verdadeira para o domínio de **manutenção** a partir desta fase — mas
  `Payable`/`TripExpense` continuam **fora de escopo** (ver seção 5).
- **`FuelStation`** (Fase 18) é o precedente direto e correto a seguir: catálogo por tenant
  (nome/CNPJ opcional/cidade/estado/ativo), referenciado por FK opcional em `FuelSupply`,
  com CRUD simples (paginação, busca, ativo/inativo, exclusão bloqueada por uso). Modelo,
  RBAC (`FUEL_STATION_READ/WRITE_ROLES` = idênticos a `FLEET_READ/WRITE_ROLES`) e service
  (`TagProvidersService.remove()`/`FuelStationsService.remove()`) foram usados como template
  direto.
- **`TagProvider`** (Fase 6) é dado **global** (sem `tenantId`) — não serve de precedente
  aqui, já que oficina/fornecedor precisam de isolamento multi-tenant estrito (pedido
  explícito da Fase 84).
- **`MaintenancePart.partId`** (Fase 83) é o precedente direto para "adicionar uma FK opcional
  a um campo de texto livre pré-existente, preservando compatibilidade" — o mesmo padrão foi
  replicado aqui para `VehicleMaintenance.workshop`/`supplier` → `workshopId`/`supplierId`.

## 2. Decisão de modelagem: oficina e fornecedor são a MESMA entidade

Comparando os dois formulários pedidos (seções 1/2 do pedido), os campos são praticamente
idênticos: nome/razão social, nome fantasia, CPF/CNPJ opcional, telefone, e-mail, endereço,
contato, observações, ativo/inativo. A única diferença é "especialidades" (tipicamente só
faz sentido para oficina).

**Decisão**: uma única tabela `MaintenanceProvider`, discriminada por `type`
(`WORKSHOP`/`SUPPLIER`), em vez de duas tabelas quase idênticas. `specialties` fica
disponível para os dois tipos sem restrição artificial (um fornecedor também pode ser
"especializado" em algo) — nenhuma regra inventada para forçar a diferença.

Consequências dessa decisão:
- **1 controller, 1 service, 1 conjunto de DTOs** para os dois conceitos — nunca duplicados.
- **1 índice único** `(tenantId, type, document)` — o mesmo CNPJ pode existir uma vez como
  `WORKSHOP` e uma vez como `SUPPLIER` (são cadastros logicamente distintos), mas nunca
  duplicado dentro do mesmo tipo.
- **`type` nunca é editável** após a criação (`UpdateMaintenanceProviderDto` omite o campo)
  — uma oficina que "virasse" fornecedor seria, na prática, um cadastro diferente; corrigir
  um erro de cadastro deve criar um novo registro, não reclassificar um existente.
- **Frontend**: `/workshops` e `/suppliers` são **rotas finas** que renderizam o MESMO
  componente compartilhado (`MaintenanceProviderListPage`/`MaintenanceProviderDetailPage`),
  parametrizado por `type` — nunca duas telas quase idênticas mantidas em paralelo.

## 3. Modelo de dados

```
MaintenanceProvider (type: WORKSHOP | SUPPLIER)
  name, tradeName?, document?, phone?, email?, address?, contactName?,
  specialties?, notes?, isActive

VehicleMaintenance.workshopId  ---->  MaintenanceProvider (type=WORKSHOP)
VehicleMaintenance.supplierId  ---->  MaintenanceProvider (type=SUPPLIER)
VehicleMaintenance.workshop/supplier (texto livre, Fase 13) -- PRESERVADOS
```

Migration aditiva `20260827000000_maintenance_providers`: `CREATE TYPE
maintenance_provider_type`, `CREATE TABLE maintenance_providers`, `ALTER TABLE
vehicle_maintenances ADD COLUMN workshop_id, ADD COLUMN supplier_id`, índices, foreign keys
(`ON DELETE SET NULL` — excluir uma oficina/fornecedor nunca apaga o histórico da OS, só
desvincula; na prática isso nunca deveria acontecer porque `remove()` já bloqueia exclusão
com OS vinculada, mas a constraint garante integridade mesmo em cenários não prrevistos).
Nenhum dado existente alterado ou removido.

**Drift pré-existente, não relacionado** (mesmo já reportado nas Fases 82/83):
`driver_shifts`/`toll_rates.updated_at` e um índice de `financial_bank_transactions` — não
tocado nesta migration.

## 4. Vínculo com a Ordem de Serviço (seção 3/8 do pedido)

`CreateMaintenanceDto`/`UpdateMaintenanceDto` ganharam `workshopId`/`supplierId` opcionais,
validados em `MaintenancesService.create()`/`update()` via
`MaintenanceProvidersService.assertActiveProviderOfType()`:

1. Pertence ao tenant (senão `404`).
2. É do `type` esperado — `workshopId` deve apontar para `WORKSHOP`, `supplierId` para
   `SUPPLIER` (senão `409`, nunca silenciosamente aceito).
3. Está **ativo** (senão `409`) — "validação de entidade ativa quando a associação exigir"
   (seção 8 do pedido). Um cadastro desativado não pode ser vinculado a uma OS nova, mas
   vínculos **já existentes** em OS antigas não são desfeitos ao desativar (histórico nunca
   alterado retroativamente).

`GET /maintenances`/`GET /maintenances/:id`/`POST`/`PATCH` passaram a incluir
`workshopName`/`supplierName` (join com `MaintenanceProvider.name`, mesmo padrão de
`vehiclePlate` da Fase 82) — as ações de ciclo de vida da OS (diagnose/approve/start/
complete/cancel/status) continuam **sem** esse join (mesma limitação documentada para
`vehiclePlate`/`parts`, sem impacto real por causa do refetch do React Query).

## 5. Despesas e financeiro — deliberadamente fora de escopo

**`TripExpense`/`Payable` NÃO foram alterados.** `TripExpense.supplier`/
`Payable.supplierName` continuam sendo snapshots de texto livre, exatamente como eram.
Razões:

1. `TripExpense` é um domínio mais amplo (combustível, pedágio, alimentação, etc.), não
   específico de manutenção — associá-lo ao catálogo `MaintenanceProvider` misturaria dois
   conceitos que hoje são propositalmente independentes.
2. O pedido é explícito: "Não implementar ainda pagamento, contas a pagar ou nova integração
   bancária" e "Não implemente funcionalidades financeiras novas nesta fase."
3. Nenhuma "oportunidade segura" de integração foi identificada que não exigisse decisões de
   produto fora do escopo desta fase (ex.: o que fazer quando o fornecedor do
   `TripExpense.supplier` texto livre não corresponde a nenhum `MaintenanceProvider`
   cadastrado).

O custo da OS (`VehicleMaintenance.totalCost`, já existente desde a Fase 45) é **a** origem
preservada e reaproveitada para o histórico de fornecedor/oficina (seção 4 abaixo) — nenhum
ledger financeiro novo, nenhuma duplicação de valores.

## 6. Integração com estoque (Fase 83) — preservada, não duplicada

Nenhuma mudança em `Part`/`PartStockMovement`/`consumePartsForMaintenance`. Quando uma peça é
consumida em uma OS realizada por uma oficina, a relação é identificável **através da
própria OS** (`PartStockMovement.maintenanceId` → `VehicleMaintenance.workshopId`/
`supplierId`) — nenhuma FK direta nova entre `PartStockMovement` e `MaintenanceProvider` foi
criada, exatamente como pedido ("o histórico deve conseguir identificar essa relação através
da própria OS").

## 7. Histórico (`GET /maintenance-providers/:id/summary`)

Sempre reaproveita `VehicleMaintenance` (nenhuma segunda fonte de custo/OS): `osCount`
(`count` onde `workshopId=id OR supplierId=id`), `vehiclesServedCount` (veículos distintos,
via `distinct: ['vehicleId']`), `totalCost` (`aggregate(_sum)`, `null` quando nenhuma OS tem
custo — nunca tratado como zero), `lastUsedAt` (OS mais recente por `openedAt`). 4 queries em
paralelo, O(1) independente do volume de OS.

## 8. APIs

Reaproveita `TenantModule.MAINTENANCE` e `FLEET_READ_ROLES`/`FLEET_WRITE_ROLES` (mesmo gate
de `/maintenances` e `/parts`) — nenhuma constante de RBAC nova.

| Método | Rota | Observação |
|---|---|---|
| GET | `/maintenance-providers` | filtro `type`/`search`/`isActive`, paginação |
| GET | `/maintenance-providers/:id` | |
| GET | `/maintenance-providers/:id/summary` | histórico (seção 7) |
| POST | `/maintenance-providers` | `type` obrigatório |
| PATCH | `/maintenance-providers/:id` | `type` nunca editável |
| PATCH | `/maintenance-providers/:id/status` | ativar/desativar |
| DELETE | `/maintenance-providers/:id` | bloqueado se houver OS vinculada |
| POST/PATCH | `/maintenances`, `/maintenances/:id` | + `workshopId`/`supplierId`; resposta + `workshopName`/`supplierName` |

## 9. Segurança

`TenantContext` + `FLEET_READ_ROLES`/`FLEET_WRITE_ROLES` reaproveitados integralmente.
`DRIVER` sem acesso; `AUDITOR` lê tudo, não escreve. Todo `findOwnedOrThrow`/mutação filtra
por `tenantId` explicitamente — oficina/fornecedor de outro tenant sempre `404`, nunca
associável a uma OS de outro tenant (o `assertActiveProviderOfType` já filtra por
`tenantId`).

## 10. Auditoria

Reaproveita `AuditService`: `maintenance_provider.created`, `.updated`, `.activated`/
`.deactivated`, `.deleted`. Nenhum mecanismo paralelo.

## 11. Frontend

- **`/workshops`** e **`/suppliers`** — rotas finas renderizando o mesmo
  `MaintenanceProviderListPage`/`MaintenanceProviderDetailPage` (ver seção 2), parametrizado
  por `type`. Listagem: busca/status/paginação server-side, criar/editar, ativar/desativar.
  Detalhe: StatCards do histórico (OS vinculadas, veículos atendidos, custo acumulado,
  última utilização), dados cadastrais, editar, ativar/desativar.
- **`/maintenances/:id`** — card "Execução" agora mostra o nome da oficina/fornecedor
  vinculado (com link para o cadastro) quando `workshopId`/`supplierId` está presente,
  caindo para o texto livre (`workshop`/`supplier`) quando não há vínculo — nenhuma
  informação histórica perdida.
- **Criar/editar OS** (`CreateMaintenanceModal`/`UpdateMaintenanceModal`) — novos seletores
  `EntitySelect` para oficina/fornecedor do catálogo (só ativos), mantendo os campos de
  texto livre existentes lado a lado para os casos ainda não cadastrados no catálogo.
- Itens de navegação "Oficinas"/"Fornecedores" adicionados em Frota (mesmo
  `RequireModule`/roles de "Manutenções"/"Peças").
- Nenhum componente visual novo — reaproveita `DataTable`/`Card`/`StatCard`/`FilterBar`/
  `Select`/`Modal`/`FormField`/`EntitySelect`/`Badge`/`Pagination`.
- **Gap corrigido de passagem** (não fazia parte do pedido, mas bloqueava a integração):
  `CreateMaintenancePayload`/`MaintenancePartInput` (frontend) não tinham `workshopId`/
  `supplierId`/`diagnosis`/`partId` (campos já existentes no backend desde as Fases 82/83,
  nunca expostos no tipo do cliente HTTP) — adicionados.

## 12. Performance / N+1

`findAll`/`getSummary`: mesma estrutura de `FuelStationsService` (findMany+count em
paralelo, agregações O(1)) — sem consulta por linha. `assertActiveProviderOfType`: 1 query
por associação validada (no máximo 2 por criação/atualização de OS: workshop + supplier),
não escala com o catálogo.

## 13. Testes direcionados

- **E2e** (`maintenance-providers.e2e-spec.ts`, novo, 9 cenários): CRUD + documento único por
  tenant+type (permitido entre types diferentes), ativar/desativar, exclusão bloqueada por OS
  vinculada, associação válida com OS (nomes retornados), associação bloqueada por type
  errado, associação bloqueada por inativo, resumo/histórico (agregação correta com 2 OS),
  isolamento multi-tenant, RBAC (DRIVER/AUDITOR).
- **Regressão** (não alterada, apenas reexecutada): `maintenances.e2e-spec.ts`,
  `maintenance-vehicle-integration.e2e-spec.ts`, `work-orders.e2e-spec.ts`,
  `parts-inventory.e2e-spec.ts`, `fleet-maintenance.e2e-spec.ts` — 78 testes, todos passando
  sem nenhuma alteração nos arquivos de teste.
- **Frontend** (vitest): `workshops/page.test.tsx` (novo, 2 testes de smoke), + `maintenances/
  page.test.tsx` e `maintenances/[id]/page.test.tsx` reexecutados (11 testes, fixture
  estendida com os campos novos).

Não foi executada a suíte completa do monorepo (regra da Fase 84) — o raio de impacto (novo
módulo `maintenance-providers/` + pontos de integração em `maintenances.service.ts`) foi
coberto diretamente pelos 6 arquivos de regressão e2e acima.

## 14. Typecheck / lint / build

`apps/api` e `apps/admin-web`: `tsc --noEmit` e `eslint` limpos em todos os arquivos novos/
alterados. Nenhuma falha pré-existente identificada nesses apps durante esta fase.

## 15. Limitações reais

- Sem integração com `TripExpense`/`Payable` (decisão deliberada, seção 5).
- `workshopName`/`supplierName` ausentes nas respostas das ações de ciclo de vida da OS
  (mesma limitação pré-existente de `vehiclePlate`/`parts`, sem impacto real na UI).
- Sem exclusão em cascata de histórico: excluir uma oficina/fornecedor sem OS vinculada é
  permitido, mas se uma OS antiga referenciar (via `ON DELETE SET NULL`, teoricamente
  impossível dado o guard de `remove()`, mas a constraint existe como rede de segurança) o
  vínculo simplesmente desaparece — o texto livre `workshop`/`supplier` da OS, se também
  preenchido, permanece como registro histórico.

## 16. Pendências reais

- Nenhuma pendência de escopo da Fase 84. Fases futuras podem avaliar: (a) permitir associar
  fornecedor a `TripExpense` quando o domínio financeiro for revisado; (b) suportar múltiplos
  contatos/telefones por oficina/fornecedor, se necessário.
