# Estoque de Peças (Fase 83)

## 1. Auditoria prévia

Antes de qualquer código, `apps/api/src/fleet/` (VehicleMaintenance/MaintenancePart),
`apps/api/src/maintenance/` (MaintenancePlan), o schema completo e os módulos de estoque/
inventário eventualmente existentes foram auditados.

**Achados**:
- **Não existia** nenhum model de catálogo de peças, estoque ou movimentação — `Part`,
  `PartStockMovement` são inteiramente novos.
- **`MaintenancePart`** (Fase 45) já existia, mas era só um item de custo em texto livre
  (`name`/`quantity`/`unitPrice`/`totalPrice`), sem nenhum vínculo com um catálogo nem efeito
  em estoque. Reaproveitado e **evoluído** (campo `partId` opcional adicionado), nunca
  duplicado em uma segunda lista de itens.
- **`FinancialAccount.currentBalance`** (Fase 78) é o precedente direto para "ledger +
  saldo": naquele domínio o saldo é 100% calculado (nenhuma coluna persistida). Esse padrão
  foi avaliado para `Part`, mas **não replicado integralmente** — ver seção 3 (justificativa
  de persistir `currentStock`).
- **`runSerializable`** (Fase 48, `tenants/utils/plan-limit.util.ts`) já existia para
  proteger contadores contra concorrência (limite de veículos/usuários/motoristas) —
  reaproveitado tal como está para proteger o saldo de estoque, nenhum mecanismo de lock
  novo criado.
- **`TireMovement`/`TireDisposal`** (Fase 20) já estabeleciam o padrão "ledger append-only +
  estado atual snapshot" para um domínio de rastreamento físico — usado como referência de
  estilo (não de dados: pneu é unidade física rastreada, peça é quantidade fungível).
- **Nenhum módulo de fornecedor/CRM** existe — mantido assim; `PartStockMovement.reference`
  é texto livre (nota fiscal, nome do fornecedor, pedido), sem entidade nova.
- **`DocumentOwnerType`/`AttachmentType`** não cobrem peças — fora de escopo, não estendido.
- **`Part`/`PartStockMovement`** vivem em um módulo novo (`apps/api/src/parts/`), no mesmo
  espírito de `apps/api/src/maintenance/` (MaintenancePlan) e `apps/api/src/tires/` — um
  sub-domínio da frota com controller/service própria, RBAC/`RequireModule` reaproveitados
  de `fleet/`, nunca uma constante nova.
- **Drift pré-existente, não relacionado**: `prisma migrate diff` contra o banco revelou 2
  linhas de drift alheias a esta fase (`driver_shifts`/`toll_rates.updated_at` perdendo um
  `DEFAULT` implícito do Prisma, e uma renomeação de índice em
  `financial_bank_transactions`) — **não incluídas** na migration desta fase (fora do
  escopo, "não altere módulos fora do necessário"), reportado aqui para conhecimento.

## 2. Modelo de dados

```
Part                        -- catalogo (SKU, nome, unidade, categoria, fabricante,
  currentStock (cache)         codigo OEM, estoque minimo, ativo/inativo)
  isLowStock   (cache)
    |
    | 1:N
    v
PartStockMovement            -- ledger append-only (IN/OUT/ADJUSTMENT)
  quantity, unitCost, movementDate, reason, reference, maintenanceId?

MaintenancePart.partId  ---->  Part   (FK opcional, nullable)
PartStockMovement.maintenanceId  ---->  VehicleMaintenance  (FK opcional, nullable)
```

Migration aditiva `20260826000000_parts_inventory`: `CREATE TYPE
part_stock_movement_type`, `CREATE TABLE parts`, `CREATE TABLE part_stock_movements`,
`ALTER TABLE maintenance_parts ADD COLUMN part_id`, índices, foreign keys. Nenhum dado
existente alterado ou removido.

## 3. Saldo de estoque: por que `currentStock` é persistido (e não só calculado)

`FinancialAccount.currentBalance` (Fase 78) é 100% calculado (nunca uma coluna) — esse foi o
precedente considerado primeiro. Duas diferenças concretas levaram a uma decisão diferente
para `Part`:

1. **Filtro "estoque baixo" precisa comparar duas colunas da MESMA linha**
   (`currentStock <= minStock`). O Prisma Client não expressa isso em `where` sem SQL bruto
   (`$queryRaw`), e este projeto não usa SQL bruto para regras de negócio em nenhum lugar
   hoje (só em 2 arquivos, ambos infraestrutura: health-check e uma query geográfica). Criar
   esse precedente só para esta fase pareceu um risco maior do que persistir um cache.
2. **A listagem precisa disso PAGINADO no banco** (seção 10 do pedido: "não carregar todo o
   catálogo no frontend") — calcular sob demanda exigiria agregar todas as movimentações de
   TODAS as peças da página a cada requisição de listagem (ou pior, de todo o catálogo para
   filtrar), o que ‘FinancialAccount’ nunca precisa fazer (ele é consultado 1 conta por vez
   ou somado em dashboard, nunca filtrado/paginado por "saldo abaixo de X").

**Garantia de consistência**: `Part.currentStock`/`Part.isLowStock` são recalculados
**exclusivamente** dentro da mesma transação `Serializable` (`runSerializable`, mesmo
utilitário da Fase 48) de cada `PartStockMovement` criado — nunca uma escrita solta. A soma
de todas as movimentações de uma peça **sempre** bate com `currentStock` (nenhum caminho no
código escreve em `Part.currentStock` fora de `PartsService.applyMovement`/
`consumePartsForMaintenance`). `isLowStock` é a mesma comparação pré-computada e persistida
apenas para permitir o filtro nativo/paginado — nunca uma segunda fonte de verdade
independente do saldo.

**Nunca aceito do cliente**: `currentStock`/`isLowStock` não existem em `CreatePartDto`/
`UpdatePartDto` — só mudam via `PartsService` (entrada/saída/ajuste/consumo em OS).

## 4. Movimentações (ledger)

Append-only (mesmo espírito de `TireMovement`/`FinancialTransaction`): nenhum
`PATCH`/`DELETE` em `PartStockMovement` existe na API. Correções sempre geram uma nova
movimentação `ADJUSTMENT` (motivo obrigatório).

| Tipo | `quantity` | Origem |
|---|---|---|
| `IN` | sempre positivo | `POST /parts/:id/stock/in` (compra/devolução/recebimento) |
| `OUT` | sempre positivo (efeito é subtrair) | `POST /parts/:id/stock/out` (manual) OU automático ao concluir uma OS |
| `ADJUSTMENT` | delta com sinal (+ ou -) | `POST /parts/:id/stock/adjustment` (motivo obrigatório) |

Nenhuma movimentação pode deixar `currentStock` negativo (`assertStockNotNegative`) — o
modelo atual **não** suporta estoque negativo explícito (decisão do pedido, seção 6: "salvo
se o modelo atual explicitamente permitir" — não permite).

## 5. Entrada / saída manuais

`POST /parts/:id/stock/in`: quantidade, custo unitário opcional (usado só para estimar valor
de estoque no dashboard), `reference` livre (nota fiscal/fornecedor/pedido) — **sem** CRM/
fornecedor novo, conforme pedido.

`POST /parts/:id/stock/out`: saída manual (uso avulso, perda). Aceita opcionalmente
`maintenanceId` para referenciar uma OS **fora** do fluxo automático (ex.: peça usada sem
ter sido itemizada na OS) — mas a origem **principal** de saída é o consumo automático (ver
seção 6).

## 6. Integração com Ordem de Serviço (PEÇA → ESTOQUE → OS) — seção mais importante

**Momento da baixa**: a **conclusão** da OS (`status -> COMPLETED`), nunca antes. Analisado
o ciclo de vida da Fase 82 (`OPEN -> DIAGNOSING -> AWAITING_APPROVAL -> APPROVED ->
IN_PROGRESS -> COMPLETED`): a lista de peças (`MaintenancePart`) pode ser reenviada/
substituída inteira a qualquer momento **antes** da conclusão (Fase 45: `update()` sempre
substitui a lista completa) — baixar estoque em qualquer estado intermediário arriscaria
múltiplas baixas incorretas conforme a lista muda. A conclusão é o único ponto do ciclo que é
**terminal e imutável** (não pode ser reaberto), tornando-a o momento seguro e correto para
"peça efetivamente usada".

**Implementação**: `MaintenancesService.applyStatusChange` (compartilhado por `PATCH
/maintenances/:id/status` e pela ação dedicada `POST /maintenances/:id/complete`, Fase 82)
chama `PartsService.consumePartsForMaintenance` **dentro da mesma transação** que grava
`status=COMPLETED`. Para cada `MaintenancePart` da OS com `partId` preenchido: cria uma
`PartStockMovement` (`OUT`, `quantity` = a quantidade da linha, `unitCost` = `unitPrice` da
linha — reaproveitado, nenhum campo de custo novo, `reference` = número da OS,
`maintenanceId` = id da OS) e atualiza `Part.currentStock`/`isLowStock`.

**Estoque insuficiente aborta a conclusão inteira**: a transação inteira (status + sync do
veículo + consumo de peças) é `Serializable`. Se qualquer peça vinculada não tiver saldo
suficiente, `ConflictException` é lançada e **toda** a transação é revertida — a OS
**permanece** no status anterior (nunca fica `COMPLETED` parcialmente). Confirmado por
`parts-inventory.e2e-spec.ts` ("bloqueia a conclusao... OS nao fica COMPLETED").

**Concorrência**: a mesma transação `Serializable` que já protegia a conclusão da OS (Fase
82) agora também protege o saldo consumido — duas OS concluídas concorrentemente consumindo
a mesma peça nunca conseguem, juntas, ultrapassar o saldo disponível (mesmo mecanismo de
retry em conflito de serialização já usado por `runSerializable` desde a Fase 48).

**Idempotência/não duplicação**: `COMPLETED` é estado terminal (Fase 82) — uma OS só pode
ser concluída uma vez, então o consumo só pode acontecer uma vez por construção. Uma
checagem defensiva adicional existe em `consumePartsForMaintenance` (verifica se já existe
uma movimentação `OUT` para aquele `maintenanceId` antes de agir) para o caso, hoje
inalcançável, de uma futura chamada duplicada.

**Peças sem `partId`** continuam funcionando exatamente como antes da Fase 83 — item de
custo em texto livre, sem nenhum efeito no estoque (comportamento 100% preservado).

**Bloqueio de edição pós-conclusão**: reenviar `parts` em `PATCH /maintenances/:id` depois
que a OS já está `COMPLETED` ou `CANCELLED` agora retorna `409` — sem esse bloqueio, a lista
de peças divergiria do que já foi baixado no estoque (risco identificado e corrigido nesta
fase, não existia antes porque peças não afetavam nada além do custo).

## 7. Cancelamento da OS

Como o consumo só acontece exatamente na transição para `COMPLETED`, e `cancel()`
(`assertWorkOrderActionAllowed`, Fase 82) só aceita origem em estados **não-terminais**
(nunca a partir de `COMPLETED`) — **uma OS cancelada nunca teve suas peças consumidas**. Os
dois eventos são mutuamente exclusivos por construção do próprio ciclo de vida da Fase 82.

**Decisão**: nenhuma regra de estorno/devolução foi implementada. Não é necessária para
manter a consistência do fluxo atual (não existe caminho onde estoque já baixado precise ser
revertido por cancelamento) — implementá-la seria adicionar código morto/nunca exercitado.
Confirmado por `parts-inventory.e2e-spec.ts` ("cancelar uma OS com peça vinculada... nunca
consome estoque").

## 8. Estoque mínimo / baixo / zerado

- **Normal**: `currentStock > minStock` (ou sem `minStock` definido, sempre `isLowStock=false`).
- **Baixo**: `isLowStock=true` (cache persistido, `currentStock <= minStock`).
- **Zerado**: `currentStock <= 0` (comparação nativa contra um literal, sem cache — subconjunto
  possível de "baixo" quando `minStock` também está definido, mas peça sem `minStock` e
  zerada aparece só como "zerado", nunca "baixo" sem uma referência real de mínimo).

`GET /parts?lowStock=true` / `?zeroStock=true`: paginado no banco, sem N+1 (filtro nativo do
Prisma sobre colunas já persistidas).

**Centro de notificações (Fase 69-70)**: **não integrado** nesta fase — o pedido permitiu
"preparar a estrutura sem expandir o escopo" quando a integração não for simples e direta;
criar um novo `AlertType`/gatilho de notificação para estoque baixo é uma decisão de produto
(quando alertar, para quem, com que frequência) fora do escopo operacional desta fase.
`isLowStock`/`isZeroStock` já ficam prontos (persistidos/calculados) para uma integração
futura simples (bastaria uma consulta periódica `WHERE isLowStock=true`).

## 9. Dashboard (`GET /parts/dashboard`)

Todos os indicadores em agregações O(1) (nunca 1 query por peça): `totalParts`/
`activeParts`/`lowStockCount`/`zeroStockCount` via `count`, `entriesInPeriod`/
`exitsInPeriod` via `aggregate(_sum)`. `estimatedStockValue`: soma de `currentStock ×
último unitCost conhecido (via IN)`, **só entre peças com pelo menos 1 entrada com
`unitCost` preenchido** — nunca inventa custo para o restante; quando nenhuma peça tem custo
conhecido, o campo vem `null` com `estimatedStockValueUnavailableReason` explícito.
`partsWithoutKnownCost` reporta quantas peças ficaram de fora dessa soma. Sem `startDate`/
`endDate`: `entriesInPeriod`/`exitsInPeriod` cobrem todo o histórico (nenhum default
arbitrário tipo "últimos 30 dias" foi inventado).

## 10. Busca e filtros (`GET /parts`)

`search` (nome/SKU/código OEM), `category` (parcial), `isActive`, `lowStock`, `zeroStock`,
paginação server-side (`page`/`pageSize`), ordenação (`sortBy`/`sortOrder`). Nenhum
carregamento do catálogo inteiro no frontend.

## 11. Segurança

Reaproveita **integralmente** `TenantContext`, `FLEET_READ_ROLES`/`FLEET_WRITE_ROLES`
(Fase 6) e `RequireModule(TenantModule.MAINTENANCE)` (mesmo gate de `/maintenances`) —
nenhuma constante/role nova. `DRIVER` sem acesso; `AUDITOR` lê tudo (catálogo, movimentações,
dashboard) mas não escreve (mesma política de `/maintenances`). Toda consulta/mutação do
`PartsService` filtra por `tenantId` explicitamente no `where` (nunca confia só no guard da
rota) — peça/OS de outro tenant sempre `404`.

## 12. Auditoria

Reaproveita `AuditService` (nenhum mecanismo paralelo): `part.created`, `part.updated`,
`part.activated`/`part.deactivated`, `part.stock_in`, `part.stock_out`,
`part.stock_adjusted`, `part.consumed_in_maintenance` (1 entrada por peça consumida, não
agregada — preserva o detalhe de qual peça/quantidade por linha).

## 13. Financeiro — deliberadamente fora de escopo

Nenhuma integração automática com `FinancialAccount`/`FinancialTransaction`/`Payable` nesta
fase. `PartStockMovement.unitCost` (entrada) e o `unitPrice` de `MaintenancePart` já ficam
disponíveis para as fases futuras de custo/km e integração operacional→financeiro
consumirem — nenhum ledger financeiro duplicado.

## 14. Frontend

- **`/parts`** (nova) — catálogo + estoque: StatCards do dashboard (total, ativas, baixo,
  zerado, valor estimado, entradas), `FilterBar` (busca/categoria/ativo/baixo/zerado),
  `DataTable` paginada (SKU/nome, categoria, estoque atual + mínimo, badge de situação,
  status, ações), modal de criação, ativar/desativar inline.
- **`/parts/:id`** (nova) — StatCards (estoque atual/mínimo/categoria/fabricante),
  identificação (descrição/código OEM/unidade), ações (registrar entrada/saída/ajuste,
  editar, ativar/desativar), histórico de movimentações paginado (com link direto para a OS
  quando a origem for consumo automático).
- **`/maintenances`**: `MaintenancePartInputDto.partId` já é aceito pelo formulário de OS
  existente por baixo (backend); vínculo peça↔OS na UI de criação/edição da OS fica como
  ponto de integração preparado (a Fase 82 já tem os formulários de peças da OS; conectar um
  seletor de peça do catálogo ali é aditivo, não fez parte do escopo funcional pedido nesta
  fase, que focou no domínio de estoque em si).
- Item de navegação "Peças" adicionado em Frota (mesmo `RequireModule`/roles de
  "Manutenções").
- Nenhum componente visual novo — reaproveita `DataTable`/`Card`/`StatCard`/`FilterBar`/
  `Select`/`Modal`/`FormField`/`ConfirmDialog`/`Badge`/`Pagination` já existentes.

## 15. Performance / N+1

- Listagem/dashboard: sempre `findMany`+`count` ou `aggregate`/`count` em paralelo,
  independente do volume de peças/movimentações (nunca 1 query por peça).
- `consumePartsForMaintenance`: 1 query para buscar as linhas de peça da OS + 1 query por
  peça vinculada dentro do loop (busca a peça atual para validar saldo) — aceitável porque
  o número de peças por OS é tipicamente pequeno (unidades), mesmo padrão de "detalhe, não
  listagem" já usado em outros pontos do projeto (ex.: `VehicleOverviewService`, ~10 queries
  paralelas por veículo). Não há N+1 por OS/página, só por item de peça da OS individual.
- `getDashboard`: 8 queries agregadas em paralelo, nunca uma por peça.

## 16. Testes direcionados

- **Unitário** (`part-stock.util.spec.ts`, novo, 8 testes): `computeIsLowStock`,
  `applyMovementDelta` (IN/OUT/ADJUSTMENT), `assertStockNotNegative`.
- **E2e** (`parts-inventory.e2e-spec.ts`, novo, 12 cenários): cadastro + SKU único, entrada/
  saída/ajuste (com validação de saldo e motivo obrigatório), estoque insuficiente (409,
  saldo inalterado), filtros lowStock/zeroStock, consumo automático ao concluir OS (saldo
  decrementado + movimentação registrada), bloqueio de conclusão por estoque insuficiente
  (OS não fica COMPLETED, saldo inalterado), cancelamento nunca consome estoque, bloqueio de
  edição de peças pós-conclusão, isolamento multi-tenant, RBAC (DRIVER/AUDITOR), dashboard
  (agregação + `estimatedStockValue` sem inventar custo).
- **Regressão** (não alterada, apenas reexecutada): `maintenances.e2e-spec.ts`,
  `maintenance-vehicle-integration.e2e-spec.ts`, `work-orders.e2e-spec.ts`,
  `fleet-maintenance.e2e-spec.ts` — 57 testes, todos passando sem nenhuma alteração nos
  arquivos de teste (comportamento pré-existente 100% preservado pela integração).
- **Frontend** (vitest): `parts/page.test.tsx` (novo, 3 testes de smoke: estado vazio, KPIs +
  badge de estoque baixo, filtro).

Não foi executada a suíte completa do monorepo (regra da Fase 83) — o raio de impacto
(módulo novo `parts/` + pontos de integração em `maintenances.service.ts`) foi coberto
diretamente pelos 4 arquivos de regressão acima.

## 17. Limitações reais

- Sem seletor de peça do catálogo na UI de criação/edição de OS (o campo `partId` já existe
  e é aceito pelo backend, mas o formulário de peças da OS no frontend continua só com texto
  livre) — pendência real, não implementada por não ter sido o foco funcional desta fase
  (estoque em si).
- Sem integração com o Centro de Notificações para estoque baixo/zerado — decisão
  documentada na seção 8, dados já prontos para uma integração futura simples.
- `estimatedStockValue` usa o **último** custo unitário conhecido (não um custo médio
  ponderado) — suficiente para uma estimativa operacional simples; um custo médio exigiria
  weighted-average sobre todas as entradas, fora do escopo desta fase.

## 18. Pendências reais

- Seletor de peça do catálogo no formulário de OS (frontend).
- Integração com notificações de estoque baixo.
- Fases futuras: fornecedores/compras completos (Fase 84+), custo/km, integração
  operacional→financeiro (Payable a partir de compra de peça).
