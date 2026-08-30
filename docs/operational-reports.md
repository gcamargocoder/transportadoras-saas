# Relatórios Operacionais (Fase 104)

## 1. Contexto e auditoria prévia

Antes de codificar, foi auditado tudo que já existia em matéria de relatórios/dashboards operacionais — e
o resultado foi decisivo para o escopo desta fase: **praticamente todos os relatórios pedidos já existem**,
maduros, testados e espalhados em páginas dedicadas construídas ao longo de dezenas de fases anteriores:

| Relatório pedido | Já existia em | Fase de origem |
|---|---|---|
| Viagens (quantidade/status/duração/desempenho) | `/operations/fleet` (seção "Operação") + `/trips` (listagem completa) | 29 |
| Entregas (realizadas/pendentes/atrasadas/falhas) | `/operations/deliveries` | 99 |
| Ocorrências (quantidade/categorias/severidade/status/evolução) | `/operations/fleet/occurrences` (já com `monthlyTrend` de 12 meses) | 68 |
| Frota (utilização/disponibilidade) | `/operations/fleet` (seção "Visão geral") | 29 |
| Manutenção (OS/custos/veículos/situação) | `/operations/fleet/maintenance` | 45 |
| Combustível (consumo/abastecimentos) | `/operations/fleet/fuel` | 41 |
| Custos operacionais (consolidado) | `/operations/fleet/costs` | 41 |
| Faturamento (fonte financeira oficial) | `/operations/fleet/billing` | 60/103 |
| Contas a receber/pagar/fluxo de caixa | `/operations/finance/*` | 72/79/80 |
| Cliente — viagens, contratos, faturamento, rentabilidade | `/customers/:id` | 59/93/97/98 |

**Não havia nenhuma lacuna de cálculo, dashboard ou fonte de dado** — construir novos endpoints de
agregação para essas frentes, como o pedido explicitamente proíbe ("não crie... cálculos duplicados ou
estruturas paralelas"), seria pura duplicação de algo já correto e testado.

### Gaps reais identificados

Auditando requisito por requisito, restaram exatamente 2 lacunas reais:

1. **"Criar uma área central de Relatórios Operacionais no admin-web"** — não existia nenhum ponto de
   entrada único que organizasse essas ~10 páginas de relatório já existentes. `/operations` (Fase 4) é uma
   página de **monitoramento em tempo real** (viagens ativas agora, com polling) — um propósito
   completamente diferente de um índice de relatórios. Cada relatório era descoberto apenas navegando pelo
   menu lateral, item por item.
2. **"Relatório por cliente: ...entregas, ocorrências..."** — o detalhe do cliente (`/customers/:id`) já
   mostrava viagens, contratos, faturamento e rentabilidade, mas **nunca havia mostrado entregas nem
   ocorrências** desse cliente. A causa raiz: `GET /delivery-occurrences` (Fase 101) nunca teve um filtro
   `customerId` (ao contrário de `GET /delivery-stops`, que já o tinha desde a Fase 99).

### Reaproveitado sem duplicação

- **Todos os indicadores exibidos** — tanto na nova área central quanto nas duas novas seções do detalhe do
  cliente — vêm de chamadas **diretas** aos endpoints de dashboard já existentes
  (`getFleetOperationsDashboard`, `getFleetOperationsFuel`, `getFleetOperationsOccurrences`,
  `getDeliveryStopsDashboard`, `getDeliveryOccurrencesDashboard`, `getBillingDashboard`) — nenhum novo
  cálculo, nenhuma nova query de agregação no backend.
- **Componentes de UI** — `Card`/`CardHeader`, `StatCard`, `FilterBar`/`DatePicker`, `PageHeader` — todos já
  existentes, nenhum componente visual novo além de um wrapper de composição (`ReportCategoryCard`, só
  organiza os já existentes em um layout consistente).
- **RBAC/multi-tenant** — cada chamada de dashboard reaproveitada já é protegida por `TenantContext`/`Roles`
  no backend correspondente (Fases 29/60/68/99/101); a nova página não introduz nenhuma verificação
  paralela — se uma chamada falha por permissão, o card correspondente simplesmente mostra "indicadores
  indisponíveis", sem quebrar a página inteira.
- **Filtros por veículo/motorista/cliente/status** — já plenamente suportados em **cada relatório
  específico** (linkado a partir da área central); a área central em si só oferece o filtro de período
  (comum a todos os dashboards agregados), evitando a complexidade de propagar filtros heterogêneos
  (`vehicleId`/`fleetId`/`driverId`/`customerId`/`status`) para seis fontes de dado diferentes numa única
  tela de resumo.

### Estrutura genuinamente nova

- **`/operations/reports`** (`OperationalReportsPage`) — área central nova, puramente composicional (zero
  cálculo próprio).
- **`ReportCategoryCard`** — componente de apresentação local (ícone + descrição + indicadores + link "Ver
  relatório completo"), reaproveitando `Card`/`CardHeader`/`StatCard` já existentes.
- **`FindDeliveryOccurrencesQueryDto.customerId`** (backend) — filtro aditivo, mesmo padrão já usado por
  `FindDeliveryStopsQueryDto.customerId` (Fase 99): filtra pela relação `Trip.customerId`, nunca uma coluna
  duplicada em `TripOccurrence`.
- **Duas novas seções no detalhe do cliente** ("Entregas" e "Ocorrências de entrega"), reaproveitando os
  dashboards cross-trip já existentes com o filtro `customerId` (novo para ocorrências, já existente para
  entregas).
- **Nenhuma migration** — nenhuma mudança de schema foi necessária.

## 2. Área central de Relatórios Operacionais (`/operations/reports`)

Nove categorias, cada uma com indicadores-resumo (reaproveitados) e um link direto para o relatório
completo (com todos os filtros/paginação/gráficos já existentes naquela página):

| Categoria | Indicadores mostrados | Relatório completo |
|---|---|---|
| Viagens | Viagens ativas, veículos em viagem | `/trips` |
| Entregas | Concluídas, atrasadas, com falha, total | `/operations/deliveries` |
| Ocorrências | Em aberto, críticas em aberto, resolvidas, total (+ quantas são de entrega) | `/operations/fleet/occurrences` |
| Frota | Ativos/total, disponíveis, em manutenção, suspensos | `/operations/fleet` |
| Manutenção | Custo total, preventivas vencidas, corretivas, veículo com maior custo | `/operations/fleet/maintenance` |
| Combustível | Litros, custo total, consumo médio, custo/km | `/operations/fleet/fuel` |
| Custos operacionais | Custo total, combustível, manutenção, custo médio/veículo | `/operations/fleet/costs` |
| Faturamento | Faturado, saldo a faturar (+ link para contas a receber/pagar/fluxo de caixa) | `/operations/fleet/billing` |
| Cliente | (sem indicador agregado — ver seção 3) | `/customers` |

**Filtro de período** (De/Até) é o único filtro na área central, aplicado a todas as chamadas de dashboard
simultaneamente. Filtros adicionais (veículo, motorista, cliente, status e demais dimensões) continuam
disponíveis em cada relatório específico, já testados em suas próprias fases.

**Falha parcial graciosa**: cada categoria é uma consulta React Query independente — se uma delas falhar
(ex.: módulo desabilitado para o tenant, indisponibilidade pontual), apenas aquele card mostra "indicadores
indisponíveis no momento", sem afetar as demais categorias.

## 3. Relatório por cliente — entregas e ocorrências

`/customers/:id` ganhou duas novas seções, no mesmo padrão visual das seções já existentes
(`StatCard` em grade, rótulo em maiúsculas explicando a fonte):

- **"Entregas"**: total, concluídas, pendentes/em andamento, atrasadas, com falha —
  `getDeliveryStopsDashboard({ customerId })` (Fase 99, filtro já suportado).
- **"Ocorrências de entrega"**: total, em aberto, críticas em aberto, resolvidas —
  `getDeliveryOccurrencesDashboard({ customerId })` (Fase 101 + filtro `customerId` novo desta fase).

Nenhum novo endpoint de detalhe foi criado — as seções reaproveitam integralmente os dashboards cross-trip
já existentes, apenas escopados a este cliente.

## 4. APIs alteradas (`apps/api/src/trip-operations`)

| Método | Rota | O que mudou |
|---|---|---|
| `GET` | `/delivery-occurrences` | Aceita `customerId` opcional (filtra por `Trip.customerId`) |
| `GET` | `/delivery-occurrences/dashboard` | Aceita `customerId` opcional (mesmo filtro) |

Nenhuma rota nova — extensão aditiva de um endpoint já existente (Fase 101), mesmo padrão já usado por
`GET /delivery-stops`/`GET /delivery-stops/dashboard` (Fase 99).

## 5. Performance / N+1

- O filtro `customerId` em `buildDeliveryOccurrenceWhere` é uma condição de relação Prisma
  (`trip: { customerId }`) resolvida na MESMA query já existente — nenhuma consulta adicional, nenhuma
  mudança na contagem de queries já testada (Fase 101: `findAllDeliveryOccurrences`/
  `getDeliveryOccurrencesDashboard` continuam com o mesmo `findMany`/`count`/`groupBy` em paralelo).
- A área central de relatórios executa 6 chamadas de dashboard em paralelo (`Promise.all` implícito via
  React Query) — mesma ordem de grandeza já aceita em `/operations/fleet`, que hoje faz 7 chamadas
  paralelas na mesma tela. Cada chamada individual já tem seu próprio teste de ausência de N+1 na fase em
  que foi criada; esta fase não altera nenhuma delas.
- As duas novas seções do detalhe do cliente adicionam 2 chamadas de dashboard (`getDeliveryStopsDashboard`,
  `getDeliveryOccurrencesDashboard`), ambas já otimizadas e testadas desde suas fases de origem.

## 6. Multi-tenant + RBAC

Reaproveitados integralmente — cada dashboard composto na área central e nas novas seções do cliente já é
protegido por `TenantContext`/`@Roles` no seu próprio controller (Fases 29/60/68/99/101), nenhuma
verificação paralela foi criada. O novo filtro `customerId` em `/delivery-occurrences` respeita o mesmo
isolamento por tenant já garantido pela cláusula `tenantId` fixa do `where` (o `customerId` filtra dentro
do tenant, nunca fora dele).

## 7. Limitações reais

- **Sem exportação (PDF/Excel/CSV)** — auditado: não existe nenhum mecanismo de exportação no projeto hoje;
  o pedido explicitamente proíbe adicionar uma biblioteca só para isso ("exportação somente se houver
  mecanismo existente"). Nenhuma exportação foi implementada.
- **Área central sem filtro por veículo/motorista/cliente** — decisão deliberada (seção 2): esses filtros já
  existem em cada relatório específico; replicá-los na tela de resumo, propagando-os corretamente para 6
  fontes de dado com nomes de campo diferentes (`startDate`/`plannedFrom`/`occurredFrom`/`from`), adicionaria
  complexidade desproporcional ao valor de uma tela de "visão geral com atalhos".
- **Sem gráfico consolidado na área central** — cada relatório específico já tem seus próprios gráficos
  (`MonthlyChartCard`, já usado em `/operations/fleet/occurrences` e `/operations/fleet/billing`); a área
  central prioriza números-resumo + navegação rápida, não uma nova visualização agregada.
- **"Relatório por cliente" na área central é só um link** — o relatório completo por cliente exige
  selecionar um cliente específico (não faz sentido agregado); a área central aponta para `/customers`, de
  onde o usuário abre o relatório individual completo (agora com entregas e ocorrências incluídas).

## 8. Testes

`apps/api/test/trip-occurrences-shifts-timeline.e2e-spec.ts`, bloco "Fase 101 — Ocorrências de Entrega",
novo teste: `customerId` filtra corretamente tanto a listagem (`GET /delivery-occurrences`) quanto o
dashboard (`GET /delivery-occurrences/dashboard`), com duas viagens de clientes diferentes.

Regressão executada: suíte completa de `trip-occurrences-shifts-timeline.e2e-spec.ts` (28/28),
`trips.e2e-spec.ts`, `customer-crm.e2e-spec.ts`, `billing-operational.e2e-spec.ts`,
`receivables.e2e-spec.ts`, `fleet-operations.e2e-spec.ts` e `trip-delivery-stops.e2e-spec.ts` — todos
passando sem alteração de comportamento pré-existente. `tsc --noEmit`, `eslint` e build de produção de
`apps/api` e `apps/admin-web` executados com sucesso.
