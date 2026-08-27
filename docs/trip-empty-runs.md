# Controle Operacional de Viagens Vazias (Fase 92)

## 1. Contexto e auditoria prévia

Antes de escrever qualquer código, foram auditados: `Trip` (incluindo `loadStatus`, campo pouco
explorado até aqui), `Customer`, `Location`, `TripDeliveryStop` (Fase 88), `RouteVersion`,
`Driver`, `Vehicle`, `TripComposition`, `TripMetrics` (Fase 27/66), `TripExpense`/
`TripSettlementsService.getFinancialDashboard` (custos), `FleetOptimizationService` (Fase 90) e
os dashboards operacionais existentes (`FleetOperationsMetricsService`,
`apps/admin-web/.../operations/fleet/page.tsx`).

### Conclusão da auditoria — a descoberta central da fase

**`Trip.loadStatus` já existe e já é exatamente o dado que a Fase 92 precisa.** Introduzido na
Fase 27 (tela "INICIAR VIAGEM" do Driver App, `POST /driver/trips/:id/start`), é um enum
`LOADED | EMPTY` **informado pelo próprio motorista no momento real da largada** — nunca
inferido, nunca calculado, sempre um fato relatado por quem estava lá. Nenhuma estrutura nova foi
necessária: a Fase 92 inteira é uma **camada de leitura/análise** sobre um dado que já era
gravado desde a Fase 27 e nunca tinha ganhado uma visão operacional dedicada.

## 2. Definição adotada de "viagem vazia"

**Uma viagem é vazia se, e somente se, `Trip.loadStatus === 'EMPTY'`.**

Nenhum outro critério decide isso. Em particular (regra 2 do pedido, seguida à risca):

- **Ausência de `Trip.customerId` NÃO torna uma viagem vazia** — muitas viagens legítimas e
  carregadas não têm cliente cadastrado no sistema ainda.
- **Ausência de `TripDeliveryStop` NÃO torna uma viagem vazia** — o recurso de múltiplas entregas
  (Fase 88) é opcional/aditivo; uma viagem simples ponto-a-ponto, carregada, pode nunca ter usado
  esse recurso.
- **`loadStatus` nulo (nunca informado) NÃO é "vazia"** — é **ausência de dado** (regra 3),
  tratada como categoria própria (`unknownLoadStatusCount`) em todo lugar, nunca somada a
  `emptyCount` nem a `loadedCount`.

Por construção, `loadStatus` só existe depois que a viagem **de fato partiu**
(`Trip.actualDeparture` preenchido) — uma viagem ainda `PLANNED` nunca aparece em nenhuma
contagem desta fase (nem vazia, nem "sem dado": ela simplesmente ainda não é elegível).

## 3. Classificação do motivo (quando há informação suficiente)

Uma vez que uma viagem já é comprovadamente vazia (`loadStatus = EMPTY`), o **motivo** é um
refinamento textual — nunca o critério que definiu a viagem como vazia — calculado a partir do
status das `TripDeliveryStop` associadas (`apps/api/src/trips/utils/empty-trip.util.ts`,
reaproveitado por igual pela listagem e pelo resumo do dashboard):

| Motivo | Condição | Interpretação |
|---|---|---|
| `NO_DELIVERIES_PLANNED` | Nenhuma `TripDeliveryStop` cadastrada | Viagem de reposicionamento/retorno — nunca teve entrega planejada |
| `ALL_DELIVERIES_CANCELLED` | Havia paradas, todas `CANCELLED` | A carga/entrega caiu antes da largada |
| `DELIVERIES_INCOMPLETE` | Havia paradas, nenhuma `COMPLETED`, nem todas `CANCELLED` | Situação real, mas sem motivo definitivo (ex.: ainda `PENDING`) |
| `COMPLETED_DELIVERIES_INCONSISTENT` | Existe ao menos 1 parada `COMPLETED` | **Contradição nos dados** — motorista informou vazio, mas há entrega concluída registrada. Nunca resolvida automaticamente; sinalizada para revisão humana |

## 4. Impacto operacional básico (somente quando calculável)

- **Distância**: `TripMetrics.actualDistanceKm`, gravada pelo `TripsService` ao concluir a viagem
  com hodômetro final (Fase 27/66) — `null` até a viagem ser concluída com esse dado, nunca
  estimada.
- **Custo**: `TripMetrics.actualTotalCost`, a mesma métrica já usada em toda a plataforma
  (fechamento financeiro, dashboards), gravada no mesmo momento — reaproveitada tal como está,
  **nenhum ledger financeiro novo** (regra 5).

> Nota de auditoria: comentários antigos em `fleet-operational-indicators.entity.ts` e no cabeçalho
> de `FleetOperationsMetricsService` registravam que `TripMetrics.actualDistanceKm` "nunca é
> escrito por nenhum service" — isso era verdade quando escritos (antes da Fase 66), mas deixou de
> ser desde que `TripsService.updateActualTripMetrics` passou a gravá-lo. A Fase 92 é a primeira a
> reaproveitar esse dado num dashboard; os comentários antigos foram anotados (não reescritos por
> completo, para não alterar histórico de decisões de fases anteriores fora de escopo).

## 5. Endpoints

| Método | Rota | Papel |
|---|---|---|
| `GET` | `/trips/empty-runs` | Listagem paginada e filtrável (driver/vehicle/status/período de partida real) — `TRIP_READ_ROLES` |
| `GET` | `/fleet-operations/empty-trips` | Resumo agregado para o dashboard (contagens, %, motivo, distância/custo somados) — `FLEET_OPERATIONS_READ_ROLES` |

Nenhum endpoint de escrita foi criado — a fase é inteiramente de identificação/consulta, nunca
altera `Trip.loadStatus` nem qualquer outro dado (esse campo continua exclusivo do fluxo de
largada do motorista, Fase 27 — regra 7, máquina de estados de `Trip` intocada).

## 6. Integração com o dashboard (sem duplicar métricas)

`FleetOperationsMetricsService.getEmptyTripsSummary` reaproveita **os mesmos** `parseFilters`/
`buildTripWhere`/`dateRangeFilter` já usados por `getOperationalIndicators` (mesmo escopo de
tenant/veículo/frota) e a **mesma** função `classifyEmptyTripReason` usada pela listagem — nenhuma
consulta nem regra duplicada. O card "Viagens vazias" foi adicionado ao dashboard consolidado
(`/operations/fleet`) seguindo exatamente o padrão já estabelecido pelos demais cards (resumo +
link "Ver detalhes →" para a página dedicada com a listagem completa).

## 7. Frontend

Nova página `/operations/fleet/empty-runs`, reaproveitando integralmente `DataTable`/`FilterBar`/
`StatCard`/`Pagination`/`EntitySelect` já usados por `/trips` e pelo dashboard de frota — nenhum
componente novo. Mostra viagem (origem→destino), partida real, veículo, motorista, status, motivo
(badge), distância e custo (`—`/"Indisponível" quando não calculável, nunca um valor fabricado).

## 8. Driver App

**Nenhuma alteração.** O app já envia `loadStatus` desde a Fase 27 via
`POST /driver/trips/:id/start` — essa é a única fonte de dado desta fase inteira, e ela já existia
antes de qualquer código escrito aqui. Não há nenhum dado novo produzido pelo backend nesta fase
que precise ser exposto de volta ao motorista.

## 9. Performance (sem N+1)

Listagem: pagina **primeiro** no banco (`where` com `loadStatus = EMPTY` + filtros, `skip`/`take`),
e só então busca em lote (2 queries fixas, bounded pelo tamanho da PÁGINA, nunca pelo total de
viagens vazias do tenant): status das `TripDeliveryStop` (`groupBy`) e `TripMetrics`
(`findMany`), ambos com `tripId IN (ids da página)`. Resumo do dashboard: mesmo princípio, bounded
pela quantidade de viagens vazias do período/filtro (não pelo tamanho da frota). Nenhuma consulta
por viagem em nenhum dos dois. Coberto por teste que conta queries reais com volume crescente.

## 10. O que NÃO pode ser determinado pelo modelo atual (documentado, não inventado)

- **Nenhuma heurística especulativa foi criada** para os casos em que falta dado (regra 9) — uma
  viagem sem `loadStatus` informado permanece, para sempre, "sem dado", nunca reclassificada por
  suposição.
- **"Trechos sem aproveitamento operacional"** dentro de uma viagem com múltiplas entregas (ex.:
  o trecho de volta após a última entrega, rodando vazio) **não é identificável** com os dados
  atuais — não há registro de carga/peso por parada (`TripDeliveryStop`), só o
  `Trip.loadStatus` agregado para a viagem inteira. Documentado como limitação real, não
  implementado.
- **Motivo "comercial"** (frete não vendido, cliente cancelou, etc.) não é derivável — o sistema
  não tem um cadastro de motivo de cancelamento comercial ligado à viagem; o `reason` calculado
  aqui é estritamente operacional (baseado em `TripDeliveryStop`), nunca um motivo de negócio
  inventado.
- **Custo/distância de viagens ainda em andamento** continuam `null` até a conclusão — a Fase 92
  não estima nada, só lê o que `TripMetrics` já registrou de fato.

## 11. Testes

`apps/api/src/trips/utils/empty-trip.util.spec.ts` (7 testes unitários, determinismo da
classificação) e `apps/api/test/trip-empty-runs.e2e-spec.ts` (14 testes, requests reais contra o
Postgres): identificação correta (`EMPTY` aparece, `LOADED` nunca aparece), ausência de dado
(viagem partida sem `loadStatus`, viagem ainda planejada), as 4 classificações de motivo,
distância/custo só após conclusão com hodômetro, filtros (driver/vehicle/status), isolamento
multi-tenant, RBAC (listagem e resumo) e ausência de N+1. `trips.e2e-spec.ts` e
`fleet-operations.e2e-spec.ts` (suítes diretamente afetadas pelas novas rotas) reexecutadas e
continuam passando sem alteração.
