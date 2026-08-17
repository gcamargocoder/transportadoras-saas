# Gestão de Fretes, Contratos e Tabelas de Frete (Fase 59)

Camada de formação de preço e contratação de fretes, integrada à operação
(Trip) e ao financeiro (TripRevenue/TripExpense, Fase 51) — sem alterar
nenhuma regra fiscal das Fases 52-58, sem emissão fiscal, sem Stripe, sem
gateway de pagamento e sem nenhuma integração externa.

## 1. Escopo

| Recurso | Status |
|---|---|
| Contratos comerciais por cliente (DRAFT/ACTIVE/SUSPENDED/EXPIRED/CANCELLED) | ✅ |
| Tabelas de frete por cliente, com vigência e contrato opcional | ✅ |
| Regras de precificação versionadas (critérios opcionais + composição de valor) | ✅ |
| Motor de cálculo puro (seleção determinística de regra + soma dos componentes) | ✅ |
| Simulação sem persistir nada | ✅ |
| Aplicação do cálculo a uma viagem (snapshot imutável) | ✅ |
| Edição humana do valor contratado/final, distinta do valor calculado | ✅ |
| Geração de receita a partir do valor comercial, sem duplicar | ✅ |
| Rentabilidade da viagem (contratado × realizado, reaproveitando o financeiro) | ✅ |
| Dashboard comercial (`/operations/fleet/freight`) | ✅ |
| Seção "Contratos e Fretes" no detalhe do cliente | ✅ |
| Enforcement por plano (`TenantModule.FREIGHT`) | ✅ |
| Emissão de CT-e/MDF-e/NF-e, cálculo fiscal, consulta SEFAZ | ❌ fora de escopo |
| Integração com gateway de pagamento/Stripe | ❌ fora de escopo |
| Roteirização/cálculo automático de distância | ❌ fora de escopo (distância é sempre informada manualmente) |

## 2. Modelagem (migration aditiva, sem alterar tabelas existentes)

4 models novos + 3 enums, todos com `tenantId` e índices por tenant/status/
vigência, sem nenhuma alteração em `Customer`/`Trip`/`TripRevenue` além de
relations novas (nenhuma coluna adicionada a essas tabelas):

- **`Contract`** — cliente, código (único por tenant), descrição, status,
  `startDate`/`endDate` (nulo = sem término), `notes`, `commercialTerms`
  (texto livre — nenhuma estrutura obrigatória foi pedida). Reaproveita
  `Customer` existente via FK `Restrict` (nunca duplica cadastro de
  cliente).
- **`FreightTable`** — cliente, contrato opcional, nome, código (único por
  tenant), status, `effectiveFrom`/`effectiveUntil` (vigência da tabela em
  si, distinta da vigência de cada regra dentro dela). Agrupa 1+
  `FreightRule`.
- **`FreightRule`** — critérios (todos opcionais: `originLocationId`/
  `destinationLocationId` — reaproveita `Location`, já existente —,
  `originRegion`/`destinationRegion` texto livre, `cargoType` texto livre
  — nenhuma taxonomia oficial de carga existe no projeto —, `vehicleType`
  reaproveitando o enum já existente, faixas de peso/cubagem, `priority`
  para desempate explícito) + composição de valor (`baseAmount`,
  `perKmAmount`, `perTonAmount`, `minimumAmount`, `tollAmount`,
  `riskAdditionalAmount`, `nightAdditionalAmount`, `dailyRateAmount`,
  `demurrageAmount`, `otherFees` JSON `[{label, amount}]` para taxas
  nomeadas livremente sem exigir coluna nova a cada taxa) + versionamento
  (`version`, `status` ACTIVE/ARCHIVED, `previousVersionId`/`nextVersion`,
  `effectiveFrom`/`effectiveUntil` — ver seção 4).
- **`TripFreight`** — 1:1 opcional com `Trip` (mesmo espírito de
  `TripSettlement`/`TripMetrics`, Fase 51): snapshot do resultado
  comercial aplicado à viagem (`contractId`/`freightTableId`/
  `freightRuleId` no momento do cálculo, `calculationInput` JSON dos
  parâmetros usados, `baseAmount`/`additionsAmount`/`tollAmount`/
  `feesAmount`/`estimatedAmount` calculados, `contractedAmount`/
  `finalAmount` editáveis por humano, `revenueId` único apontando para o
  `TripRevenue` gerado a partir desse valor — nunca duplicado).

`TenantModule` (Fase 48) ganhou o valor `FREIGHT`, incluído também no
`enabledModules` padrão de `TenantPlan` (não remove acesso de nenhum
tenant existente). Todos os 5 controllers do módulo usam
`@RequireModule(TenantModule.FREIGHT)`.

Migration aplicada em 2 arquivos (`..._freight_tenant_module_enum` +
`..._freight_management`) porque o Postgres exige que um novo valor de
enum (`FREIGHT`) seja *commitado* antes de poder ser referenciado no
`DEFAULT` de outra coluna na mesma migração — sem isso, `prisma migrate
deploy` falha com `unsafe use of new value` mesmo dentro de uma migration
tecnicamente correta.

## 3. Motor de cálculo (`freight/utils/freight-calculation.util.ts`)

Duas funções **puras** (sem Prisma, sem I/O, 27 testes unitários):

### 3.1 Seleção de regra (`selectApplicableFreightRule`)

1. Filtra por vigência (`effectiveFrom <= asOf <= effectiveUntil` ou
   `effectiveUntil` nulo) e por cada critério preenchido na regra — um
   critério nulo na regra nunca restringe; uma regra com faixa de
   peso/cubagem só é elegível quando o pedido informa o dado
   correspondente (nunca assume peso zero).
2. Entre as candidatas, desempate **determinístico** (nunca heurística,
   seção 21 do pedido): (a) mais **específica** vence (mais critérios
   preenchidos na regra que efetivamente restringiram o resultado); (b)
   em empate, maior `priority` explícito; (c) em empate, `effectiveFrom`
   mais recente; (d) em empate total, `id` em ordem lexicográfica
   crescente — garante o MESMO resultado sempre, independente da ordem em
   que o banco devolveu as linhas.

### 3.2 Cálculo (`computeFreightQuote`)

```
base = baseAmount + perKmAmount × distanceKm + perTonAmount × (weightKg / 1000)
base = max(base, minimumAmount)          // minimo nunca se aplica a pedagio/adicionais/taxas
adicionais = (riskCargo ? riskAdditionalAmount : 0) + (nightService ? nightAdditionalAmount : 0)
taxas = dailyRateAmount × dailyCount + demurrageAmount × demurrageCount + soma(otherFees)
pedagio = tollAmount
total = base + adicionais + pedagio + taxas
```

Qualquer componente ausente na regra é tratado como `0` no cálculo — uma
regra sem nenhum valor configurado resulta em total `0` (nunca um erro,
mas também nunca "inventado"; a UI deixa claro que o valor veio de uma
regra vazia através dos próprios campos zerados exibidos).

## 4. Versionamento (seção 4 do pedido)

**Nunca** existe update in-place de uma `FreightRule`. `POST
/freight/rules/:id/revise`:

1. Fecha a versão atual numa transação: `status = ARCHIVED`,
   `effectiveUntil = novo effectiveFrom`.
2. Cria uma nova linha: `version + 1`, `status = ACTIVE`,
   `previousVersionId` apontando para a anterior, herdando todo campo
   omitido no corpo da requisição (só os campos explicitamente enviados
   mudam).

Combina os dois padrões de versionamento já estabelecidos no projeto:
encadeamento por `previousVersionId`/`nextVersion` (mesmo espírito de
`ChecklistTemplate`, Fase 38 — preserva a árvore de histórico navegável) e
vigência por `effectiveFrom`/`effectiveUntil` (mesmo espírito de
`TollRate`, Fases 23/33 — permite a consulta "qual regra valia nesta
data", que `TripFreight` depende para nunca mudar retroativamente).

**Garantia central**: `TripFreight` grava um **snapshot numérico** no
momento do cálculo (`baseAmount`/`additionsAmount`/`tollAmount`/
`feesAmount`/`estimatedAmount`), não uma referência viva à regra. Revisar
a regra depois (ou até arquivar a `FreightTable`) nunca altera o valor já
gravado em viagens antigas — testado explicitamente em
`freight.e2e-spec.ts` ("alterar a tabela/regra nunca altera o valor já
gravado em viagens antigas").

Contratos vencidos (`endDate` no passado) nunca podem ser usados para uma
**nova** aplicação a viagem (`ContractsService.assertUsableForNewTrip`,
chamado por `POST /freight/trips/:tripId/apply`) — isso não impede
consulta/edição do contrato em si, só a aplicação a uma viagem nova.

## 5. Simulação (`POST /freight/simulate`)

Recebe `customerId` (obrigatório — define quais tabelas são elegíveis) +
todos os parâmetros de cálculo (origem/destino/distância/peso/cubagem/
veículo/tipo de carga/adicionais), todos opcionais. Busca as
`FreightTable` `ACTIVE` e vigentes do cliente (ou uma específica via
`freightTableId`), reúne as `FreightRule` `ACTIVE` dessas tabelas, aplica
o motor de cálculo. **Nunca persiste nada.** Quando nenhuma regra é
compatível, retorna `available: false` com um `reason` explícito — nunca
um preço zero mascarando a ausência (seção 21).

## 6. Integração com a viagem

- `GET /freight/trips/:tripId` — consulta o snapshot atual (`null` quando
  a viagem nunca teve nenhum cálculo aplicado).
- `POST /freight/trips/:tripId/apply` — roda a mesma resolução da
  simulação (agora persistindo) e grava/atualiza o `TripFreight` da
  viagem. **Reaplicar (recalcular) nunca sobrescreve** `contractedAmount`/
  `finalAmount`/`revenueId` — só os campos calculados (`baseAmount` .. 
  `estimatedAmount`) são atualizados. `customerId` default: o
  `Trip.customerId` da própria viagem, quando não informado.
- `PATCH /freight/trips/:tripId` — edição humana de `contractedAmount`/
  `finalAmount` (negociação), nunca dispara recálculo.
- Quando nenhuma regra é encontrada na aplicação, o `TripFreight` ainda é
  gravado (com `freightRuleId`/valores todos `null`) — é exatamente esse
  registro que alimenta o indicador "viagens sem tabela/regra aplicável"
  do dashboard (seção 8), distinguindo "nunca tentado" de "tentado e sem
  regra compatível".

## 7. Integração financeira (Fase 51)

`POST /freight/trips/:tripId/apply-revenue` reaproveita **integralmente**
`TripRevenuesService.create()` (nenhuma lógica de criação de receita
duplicada) para gerar 1 `TripRevenue` (categoria `FREIGHT`) a partir de
`contractedAmount ?? finalAmount ?? estimatedAmount` (o primeiro
disponível). `TripFreight.revenueId` é `@unique` — reaplicar quando já
existe uma receita gerada retorna **409**, nunca cria uma segunda (testado
explicitamente). O CRUD financeiro existente (`TripRevenue`/
`TripExpense`) continua **inalterado** — a única mudança é uma forma nova
de *originar* uma receita, nunca um novo mecanismo de armazenamento.

### 7.1 Rentabilidade (`GET /freight/trips/:tripId/profitability`)

Reaproveita **integralmente**
`TripSettlementsService.getFinancialDashboard()` (Fase 51) para
`realizedRevenue`/`realizedCost`/`realResult` — nenhum custo é
recalculado em paralelo. **Substituição documentada**: o pedido original
cita `computeCosts()` como a função a ser reaproveitada; essa função,
como encontrada no código (`fleet-operations-metrics.service.ts`), calcula
custo agregado por **frota**, não por viagem individual, e não tem
nenhuma relação com cliente/contrato. A função realmente equivalente para
"custo realizado de UMA viagem" já existente no projeto é
`TripSettlementsService.getFinancialDashboard()` — é essa que foi
reaproveitada, preservando a intenção do pedido (reutilizar o financeiro
já existente, nunca duplicar o cálculo de custo).

"Custo previsto" **não existe** como conceito em nenhum lugar do projeto
(nenhuma estimativa de custo é feita antes da viagem acontecer). Por isso
`projectedMargin`/`projectedResult` comparam o valor **contratado** contra
o custo **já realizado** conhecido até o momento da consulta — nunca uma
estimativa de custo inventada. Isso é uma limitação real, documentada
explicitamente na entity (`TripProfitabilityEntity`) e na UI.

## 8. Dashboard comercial (`GET /freight/dashboard`, `/operations/fleet/freight`)

Filtros: `startDate`/`endDate` (period sobre `TripFreight.createdAt`) +
`customerId` — mesmo espírito de `FleetOperationsQueryDto` (período +
cliente), num DTO próprio do módulo (`FindFreightDashboardQueryDto`) em
vez de importar literalmente o DTO de outro domínio, mesmo padrão já
usado por `FindFiscalDocumentsQueryDto` (Fase 52) em relação a outros
módulos.

Indicadores: valor contratado no período, fretes realizados, ticket médio
(`null` quando não há frete no período — nunca `0` mascarando ausência),
margem prevista/resultado real/diferença previsto×realizado (mesma
semântica da seção 7.1, agregada), principais clientes/rotas/tabelas por
valor contratado (top 10), contratos `ACTIVE` vencendo nos próximos 30
dias, e viagens com cliente definido no período sem tabela/regra
aplicável (via filtro de relação opcional do Prisma — `trip.freight IS
NULL OR trip.freight.estimatedAmount IS NULL` — 1 única query, nunca 1
por viagem).

### 8.1 Performance (sem N+1)

1 `findMany` de `TripFreight` no escopo do filtro (com `trip`/
`freightTable` incluídos) + 4 agregações em paralelo (receita/despesa/
combustível/pedágio, todas escopadas por `tripId IN (...)` do lote já
carregado — mesmas tabelas usadas por `computeCosts()`/
`getFinancialDashboard()`, nunca um motor de custo paralelo) + 1 busca
bounded de contratos vencendo + 1 `count` para viagens sem regra — 7
queries fixas, **independente da quantidade de clientes/contratos/regras**
do tenant (só escala com o volume de fretes no período filtrado, mesmo
princípio de todo dashboard já existente no projeto). Testado com 5 vs. 20
fretes aplicados (`freight.e2e-spec.ts`, contagem real de queries via
`$extends`) — sem crescimento.

## 9. Detalhe do cliente (`/customers/:id`, novo — não existia página de
detalhe de cliente antes desta fase)

Seção "Contratos e Fretes": contratos `ACTIVE`, tabelas `ACTIVE`
vigentes, últimas 10 viagens do cliente, e os mesmos indicadores do
dashboard comercial (seção 8) filtrados por `customerId` — reaproveita
`GET /freight/dashboard?customerId=...`, nenhum endpoint novo. Nenhum
cadastro paralelo de cliente foi criado; a listagem existente
(`/customers`) passou a navegar para esta página ao clicar na linha.

## 10. Frontend

`/operations/fleet/freight` (nova aba "Fretes" na navegação da Gestão da
Frota) — uma página com abas internas (`Tabs`, mesmo componente já usado
no detalhe da viagem): Dashboard, Contratos, Tabelas de frete, Regras,
Simulador. Reaproveita `DataTable`/`Modal`/`FormField`/`FilterBar`/
`EntitySelect`/`StatCard`/`Card`/`Badge`/`Pagination` — nenhum componente
visual novo, nenhuma biblioteca nova. Aba "Comercial" nova no detalhe da
viagem (`features/trips/tabs/freight-tab.tsx`) mostra o snapshot
aplicado, permite recalcular, editar valores negociados, gerar receita, e
a rentabilidade (seção 7.1).

**Limitação real**: o formulário de regra na UI não expõe um editor
estruturado para `otherFees` (taxas nomeadas livremente) — o backend
suporta o campo via API, mas a interface visual desta fase só expõe os
campos fixos de valor (base/km/tonelada/mínimo/pedágio/adicionais/
diária/estadia). Cadastrar `otherFees` custom requer chamar a API
diretamente nesta fase.

## 11. Segurança e performance (geral)

`TenantGuard`/`RolesGuard`/`RequireModuleGuard` em todos os 5
controllers, mesmo grupo de roles operacional já usado por
`TripRevenue`/`FiscalDocument` (`SUPER_ADMIN`/`ADMIN`/`MANAGER`/
`OPERATOR`/`DISPATCHER` escrevem; `AUDITOR` só lê; `DRIVER` nunca acessa —
sem fluxo comercial no Driver App nesta fase). Toda mutação relevante é
auditada via `AuditService` (criação/atualização/transição de status de
contrato e tabela, criação de regra/nova versão, aplicação/recálculo de
frete à viagem, edição de valores negociados, geração de receita) — nenhum
sistema de auditoria paralelo. Isolamento cross-tenant testado
explicitamente (contrato/tabela/regra de um tenant retornam 404 para
outro tenant).

## 12. Testes

- **Unitário** (`freight-calculation.util.spec.ts`, 27 testes): seleção
  de regra (especificidade, prioridade, vigência, faixas de peso/cubagem,
  ausência de regra, desempate determinístico por id) e cálculo (base +
  km + tonelada, valor mínimo, adicionais condicionais, taxas, pedágio,
  soma total).
- **E2e** (`freight.e2e-spec.ts`, 19 testes): CRUD de contrato (com
  transições de status auditadas), código duplicado (409), contrato
  vencido nunca aplicável a viagem nova, versionamento de regra (revisão
  preserva a anterior ARCHIVED, não permite revisar uma versão já
  arquivada), simulação (sem tabela, sem regra compatível, cálculo
  correto, regra vencida nunca usada), aplicação a viagem (snapshot,
  reaplicar nunca sobrescreve valores negociados, alteração de regra
  nunca muda o histórico), integração financeira (geração de receita,
  nunca duplicada, rentabilidade), dashboard (reflete valor
  contratado, conta viagens sem regra aplicável), isolamento
  multi-tenant, RBAC, e N+1 do dashboard (5 vs. 20 fretes aplicados).
- Suíte completa `fiscal-documents.e2e-spec.ts` (58 testes) reexecutada
  junto — nenhuma regressão nas Fases 52-58.

## 13. Limitações reais / fora de escopo (declarado)

- Nenhuma roteirização/cálculo automático de distância — `distanceKm` é
  sempre informado manualmente (simulação/aplicação), nunca derivado de
  geolocalização.
- Nenhuma emissão de CT-e/MDF-e/NF-e, cálculo fiscal, consulta SEFAZ,
  Stripe, gateway de pagamento ou integração externa foi implementada —
  fora de escopo desta fase (seção 21 do pedido).
- "Custo previsto" não existe como conceito no projeto (seção 7.1) —
  margem prevista compara contratado × custo já realizado, nunca uma
  estimativa de custo futura inventada.
- Editor de `otherFees` (taxas nomeadas livremente) não está exposto na
  UI desta fase (seção 10) — suportado pela API.
- Concorrência de versionamento: `revise()` faz check-then-act
  (`status === ACTIVE` → `ConflictException`) dentro de uma transação
  Prisma, mesmo padrão já usado em `checklist-templates.service.ts`
  (nenhum mecanismo de lock otimista existe em nenhum lugar do projeto
  hoje) — 2 requisições de revisão *simultâneas* sobre a mesma versão
  poderiam, em teoria, ambas passar a checagem antes de uma delas
  commitar; a janela é a mesma já aceita pelo padrão pré-existente do
  projeto e não foi criada uma solução nova para este caso specific.
