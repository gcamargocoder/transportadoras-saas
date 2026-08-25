# Disponibilidade da Frota (Fase 86)

## 1. Contexto e auditoria prévia

Antes de escrever qualquer código, foram auditados: `VehicleAvailabilityService` e
`resolveVehicleAvailability` (Fase 81, `apps/api/src/fleet/services/vehicle-availability.service.ts`),
`VehicleEntity`/`toVehicleEntity` (Fase 62), `VehicleSummaryEntity`/`VehiclesService.getSummary()`
(Fase 62), `FindVehiclesQueryDto` (filtros já existentes), `VehiclesService.syncStatusForMaintenance`
(Fase 63) e a tela `apps/admin-web/src/app/(app)/vehicles/page.tsx`.

**Conclusão da auditoria: a maior parte do pedido pela Fase 86 já existia**:

| Item pedido pela Fase 86 | Já existia | Fase |
|---|---|---|
| Regra central de disponibilidade (ACTIVE + sem viagem = disponível; ACTIVE + viagem = em viagem; != ACTIVE = indisponível) | `resolveVehicleAvailability`/`VehicleAvailabilityService` | 81 |
| Veículo bloqueado corretamente por manutenção | `VehiclesService.syncStatusForMaintenance` sincroniza `Vehicle.status = MAINTENANCE` sempre que há uma `VehicleMaintenance` `IN_PROGRESS` (e reverte para `ACTIVE` quando não há mais nenhuma) | 63 |
| Filtro por status, tipo e busca | `GET /vehicles?status=&type=&search=` (`FindVehiclesQueryDto`) | 62 |
| Paginação, listagem, acesso ao detalhe | `GET /vehicles`, `GET /vehicles/:id`, tela `/vehicles` + `/vehicles/[id]` | 62 |
| Indicadores globais (contagem por status/propriedade) | `GET /vehicles/summary` (`VehicleSummaryEntity`) | 62 |
| RBAC e isolamento multi-tenant | `FLEET_READ_ROLES` + `TenantContext.requireTenantId()` | 6/62 |
| `TripsService.assertCanStart` (regra de bloqueio de início de viagem) | Validação própria, mais específica (janela de data), preservada sem alteração desde a Fase 81 | 14/81 |

**Nada disso foi recriado.** `VehicleAvailabilityService`, `ACTIVE_TRIP_STATUSES`,
`onTripWhereFragment`, `syncStatusForMaintenance` e `TripsService.assertCanStart` foram reutilizados
exatamente como estão — nenhuma cópia, nenhuma segunda implementação.

## 2. A lacuna real: granularidade de exibição

`resolveVehicleAvailability` (Fase 81) retorna só 3 valores: `AVAILABLE` / `ON_TRIP` /
`UNAVAILABLE` — qualquer status diferente de `ACTIVE` (INACTIVE, SUSPENDED, MAINTENANCE, SOLD)
cai em `UNAVAILABLE`, sem distinguir "em manutenção" de "inativo" de "suspenso". Esse campo
(`VehicleEntity.availability`) é usado por regras e testes já existentes (filtro
`?availability=`, alertas, dashboards) e **não foi alterado** — mudar seu significado quebraria
contratos testados desde a Fase 62.

A Fase 86 pediu exatamente essa granularidade (disponível/em viagem/em manutenção/indisponível/
inativo, com motivo). A solução foi **aditiva**: uma nova função pura, ao lado da existente na
mesma fonte central, reaproveitando os MESMOS sinais (`Vehicle.status` + `onTrip`).

## 3. Fonte da disponibilidade e prioridade das regras

`resolveFleetAvailabilityStatus(status, onTrip)` (novo, em
`apps/api/src/fleet/services/vehicle-availability.service.ts`, ao lado de `resolveVehicleAvailability`):

```
status === INACTIVE     -> { status: INACTIVE,     reason: 'Veiculo inativo.' }
status === MAINTENANCE  -> { status: MAINTENANCE,  reason: 'Veiculo em manutencao (ordem de servico em andamento).' }
status === SUSPENDED    -> { status: UNAVAILABLE,  reason: 'Veiculo suspenso administrativamente.' }
status === SOLD         -> { status: UNAVAILABLE,  reason: 'Veiculo vendido.' }
status === ACTIVE:
  onTrip === true       -> { status: ON_TRIP,      reason: null }
  onTrip === false      -> { status: AVAILABLE,    reason: null }
```

**Prioridade**: qualquer `status != ACTIVE` sempre vence `onTrip` — mesma precedência exata de
`resolveVehicleAvailability` (Fase 81), nunca uma regra nova. Isso cobre diretamente as regras 4
e 5 do pedido ("veículo em viagem não aparece como disponível", "veículo inativo nunca é
disponível") e também o caso de inconsistência de dados (ex.: um veículo em MAINTENANCE que por
algum motivo ainda tenha uma composição vinculada a uma viagem em andamento continua reportado
como MAINTENANCE, nunca ON_TRIP — testado explicitamente, ver seção 8).

`MAINTENANCE` **não faz nenhuma consulta adicional** a `VehicleMaintenance` — reaproveita
integralmente a sincronização já existente da Fase 63 (`Vehicle.status` já reflete a OS aberta).

## 4. Estados possíveis e motivos

5 categorias (`FleetAvailabilityStatus`), nunca 6 — `SUSPENDED` e `SOLD` (ambos “o veículo não
pode ser usado por decisão/situação administrativa”, distinto de manutenção física ou
desativação) são agrupados em `UNAVAILABLE`, cada um com seu próprio texto de motivo:

| Status | Motivo (quando houver) |
|---|---|
| `AVAILABLE` | — (nunca há motivo) |
| `ON_TRIP` | — (nunca há motivo) |
| `MAINTENANCE` | "Veiculo em manutencao (ordem de servico em andamento)." |
| `INACTIVE` | "Veiculo inativo." |
| `UNAVAILABLE` | "Veiculo suspenso administrativamente." OU "Veiculo vendido." |

O motivo nunca é inventado: é sempre derivado do próprio `Vehicle.status` (dado real do
sistema), nunca uma suposição sobre uma causa externa (ex.: não tenta adivinhar por que a
suspensão foi aplicada).

## 5. O que foi implementado

- `FLEET_AVAILABILITY_STATUS_VALUES`/`FleetAvailabilityStatus` (novo, em `vehicle.entity.ts`,
  ao lado do já existente `VEHICLE_AVAILABILITY_VALUES`/`VehicleAvailabilityValue`, nunca
  alterado).
- `resolveFleetAvailabilityStatus` (novo, em `vehicle-availability.service.ts`).
- `VehicleEntity.fleetAvailabilityStatus` + `VehicleEntity.unavailabilityReason` (campos
  aditivos, calculados em `toVehicleEntity`/`vehicle.mapper.ts` a partir do MESMO
  `VehicleDerivedContext.onTrip` já resolvido em lote pelo `VehiclesService` — nenhuma query
  adicional).
- `VehicleAvailabilityBreakdownEntity` (novo) + `VehicleSummaryEntity.availabilityBreakdown`
  (5 entradas, quantidade + percentual por status, calculado a partir das MESMAS contagens já
  produzidas por `getSummary()` — nenhuma query adicional; `percent = count/total*100`
  arredondado a 1 casa decimal, sempre `0` quando `total = 0`, nunca divide por zero).

## 6. APIs

Nenhum endpoint novo. `GET /vehicles` e `GET /vehicles/:id` (existentes) passam a retornar
`fleetAvailabilityStatus`/`unavailabilityReason` no payload de cada veículo — preserva
integralmente as informações já existentes (`status`, `availability`, etc.), apenas adiciona.
`GET /vehicles/summary` (existente) passa a retornar `availabilityBreakdown`. Filtros
`?status=`, `?type=`, `?search=`, `?availability=` (3 valores, inalterado) continuam
funcionando exatamente como antes — nenhum filtro novo foi necessário, o pedido já estava
coberto.

## 7. Frontend

Evoluída a tela já existente `apps/admin-web/src/app/(app)/vehicles/page.tsx` — nenhuma tela
nova:

- KPIs: os StatCards de disponibilidade agora mostram "quantidade (percentual)" (ex.: "12
  (60.0%)"), lidos de `availabilityBreakdown`; as 5 categorias pedidas (Disponíveis/Em
  viagem/Em manutenção/Indisponíveis/Inativos) substituem o antigo conjunto ad-hoc
  (Ativos/Suspensos), que misturava uma métrica derivada (Ativos = disponível + em viagem) com
  uma categoria de status única (Suspensos, sem incluir Vendidos).
- Coluna "Disponibilidade" da tabela: badge com o novo status de 5 categorias (mais informativo
  que os 3 anteriores) + linha de motivo abaixo quando houver — reaproveita `Badge` e o padrão
  de rótulos/tons já usado em toda a aplicação (`FLEET_AVAILABILITY_STATUS_LABELS/TONE`, novo,
  ao lado dos já existentes `VEHICLE_AVAILABILITY_LABELS/TONE`, que ficam intactos para uso
  futuro).
- `apps/admin-web/src/app/(app)/vehicles/[id]/page.tsx`: o badge de disponibilidade do
  cabeçalho passa a usar o novo status de 5 categorias; o motivo (quando houver) é anexado à
  descrição do cabeçalho. Nenhuma informação existente foi removida — filtros, tabelas,
  overview, documentos, manutenções etc. continuam exatamente como estavam.
- Filtros por status/tipo/busca: já existiam (`Select` de Status/Tipo + `SearchInput`),
  nenhuma alteração necessária.

## 8. Testes executados

- **Unitário** (novo): `vehicle-availability.service.spec.ts` — 10 testes (3 pré-existentes de
  `resolveVehicleAvailability` + 7 novos de `resolveFleetAvailabilityStatus`, cobrindo os 5
  estados e a prioridade status-vence-onTrip mesmo em inconsistência de dados).
- **E2e** (novo): `fleet-availability.e2e-spec.ts` — 10 testes: cada estado de disponibilidade
  (disponível, em viagem via `Trip` `IN_PROGRESS`, em manutenção via `VehicleMaintenance`
  `IN_PROGRESS`, inativo, suspenso), `availabilityBreakdown` com contagem/percentual corretos
  (soma 100%), percentual nunca divide por zero (tenant sem veículos), isolamento multi-tenant,
  RBAC (DRIVER 403 em `/vehicles` e `/vehicles/summary`), ausência de N+1.
- **E2e** (regressão): `vehicle-management.e2e-spec.ts` + `maintenance-vehicle-integration.e2e-spec.ts`
  (29/29) e `fleet.e2e-spec.ts` + `fleet-operations-vehicles.e2e-spec.ts` (43/43) — **72/72
  passando**, sem alteração nos arquivos de teste (campos aditivos não quebram nenhuma
  asserção existente, incluindo as que checam `availability` 3-valores e o filtro
  `?availability=UNAVAILABLE` exatamente como antes).
- **Frontend** (novo): `vehicles/page.test.tsx` — 4 testes (KPIs com percentual, motivo exibido
  em manutenção, motivo ausente quando disponível, motivo exibido quando inativo). Não havia
  suíte de teste para esta página antes desta fase.
- **Typecheck**: `apps/api` e `apps/admin-web` (`tsc --noEmit`) — limpos.
- **Lint**: todos os arquivos alterados/criados — limpo.

Não foi executada a suíte completa do monorepo nem build — sem alteração de schema, o escopo
desta fase não justificava uma regressão ampla.

## 9. Performance / N+1

`fleetAvailabilityStatus`/`unavailabilityReason` são funções puras do MESMO
`VehicleDerivedContext.onTrip` já resolvido em lote (2 queries para a página inteira, nunca 1
por veículo — Fase 62). `availabilityBreakdown` reaproveita as contagens já produzidas por
`getSummary()` (`groupBy`/`count`, independente da quantidade de veículos). **Nenhuma query
adicional foi introduzida** por esta fase. Teste e2e dedicado confirma que a contagem de
queries de `GET /vehicles` não cresce entre 3 e 15 veículos.

## 10. Decisões de reaproveitamento (resumo)

- `VehicleAvailabilityService`/`resolveVehicleAvailability`/`ACTIVE_TRIP_STATUSES`/
  `onTripWhereFragment` (Fase 81): reutilizados integralmente, nunca duplicados.
- `syncStatusForMaintenance` (Fase 63): fonte única de verdade para "veículo bloqueado por
  manutenção" — nenhuma segunda consulta a `VehicleMaintenance`.
- `TripsService.assertCanStart`: preservado sem nenhuma alteração (decisão já registrada desde
  a Fase 81 em `docs/fleet-operations.md` — validação mais específica, por janela de data, não
  substituída pela checagem central de disponibilidade).
- `VehicleSummaryEntity`/`getSummary()` (Fase 62): estendida (campo aditivo), nunca recriada.
- `FindVehiclesQueryDto` (Fase 62): reaproveitada sem alteração — já cobria status/tipo/busca.

## 11. Limitações reais

- `UNAVAILABLE` agrupa `SUSPENDED` e `SOLD` — a taxonomia de 5 categorias pedida pela Fase 86
  não distingue os dois no nível do status agregado (`fleetAvailabilityStatus`), apenas no
  texto do motivo (`unavailabilityReason`). Quem precisar distinguir os dois programaticamente
  ainda usa o campo `status` (`VehicleStatus`, já existente, inalterado).
- O motivo é sempre um texto fixo por status — não incorpora detalhes específicos da instância
  (ex.: não cita o número da OS aberta, nem a data da suspensão), para evitar uma consulta
  adicional por veículo (risco de N+1) e para não inventar informação que o motivo textual por
  si só já não precisa carregar. O detalhe completo (OS, datas) continua disponível na tela de
  detalhe do veículo (`/vehicles/:id/overview`, Fase 62/63), que não foi alterada.
- Não foi criado nenhum filtro server-side novo para o status de 5 categorias — o filtro
  `?status=` (raw `VehicleStatus`) combinado com `?availability=` (3 categorias) já cobre a
  mesma seletividade sem duplicar lógica de filtro.
- Fase 86 é estritamente sobre disponibilidade — nenhuma alteração em planejamento de viagens,
  regras de despacho ou `TripsService`; isso é escopo da Fase 87.
