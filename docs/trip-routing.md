# Roteirização Operacional de Viagens Multi-Entrega (Fase 89)

## 1. Contexto e auditoria prévia

Antes de escrever qualquer código, foram auditados: `Trip`, `TripDeliveryStop` (Fase 88),
`RouteVersion`/`RoutePlan`/`RouteEvent` (Fase 23/26), `Location` (incluindo o campo `geoPoint`,
PostGIS), `apps/api/src/routing/*` (`RoutingService`, `RoutingProviderPort`,
`GoogleRoutingProvider`, `NotConfiguredRoutingProvider`, `routing.module.ts`),
`apps/api/src/trips/services/trip-delivery-stops.service.ts` e `trips.controller.ts` (Fase 88),
`apps/admin-web/src/features/trips/tabs/delivery-stops-tab.tsx`, e
`apps/driver-app/src/api/driverTrips.*`.

### Conclusão da auditoria

**O projeto já possui uma integração de roteirização geográfica (Fase 26)** —
`RoutingProviderPort` (interface), `GoogleRoutingProvider` (implementação real) e
`NotConfiguredRoutingProvider` (fallback explícito, nunca simula dados), selecionados em runtime
por `routing.module.ts` conforme `GOOGLE_ROUTES_API_KEY`. **Nesta instalação, essa variável não
está configurada** (`apps/api/.env` não a define) — logo `RoutingService` opera hoje com
`NotConfiguredRoutingProvider`, que responde com `503` a qualquer tentativa de cálculo. Essa
integração existente é para **um único trecho** (origem → destino da viagem inteira, usada por
`RoutePlan`/conciliação de pedágio) — nunca foi desenhada para rotear N paradas intermediárias.

**Nenhuma coordenada geográfica é capturada para `Location`** — o campo `geoPoint` (PostGIS)
existe no schema mas `CreateLocationDto` nunca o expõe (comentário no próprio DTO: "geoPoint
(PostGIS) não é exposto aqui -- exige SQL bruto"). Ou seja: mesmo que o provider estivesse
configurado, não há coordenadas persistidas por `Location` para alimentar um algoritmo geográfico
de sequenciamento de paradas.

**Conclusão prática (regra 10 do pedido):** não existe, nesta instalação, um provedor de
roteirização geográfica **utilizável para múltiplas paradas**. O que existe é reaproveitado
(regra 9) apenas como **sinal informativo** (`RoutingService.isProviderConfigured()`); nenhuma
integração nova, falsa ou parcial foi criada.

## 2. Algoritmo/motor utilizado

Como não há provedor geográfico utilizável nem coordenadas de `Location`, o motor desta fase usa
o **único dado real, já existente e nunca inventado** que informa proximidade temporal entre
entregas: `TripDeliveryStop.plannedArrival` (previsão de chegada informada manualmente no
planejamento, Fase 88).

**Regra do algoritmo** (`TripRoutingService.buildSuggestion`, puro, sem I/O):

1. Paradas com `plannedArrival` preenchido são ordenadas cronologicamente (ascendente).
2. Paradas sem `plannedArrival` mantêm sua posição relativa atual entre si, sempre **depois** das
   que têm previsão (nunca reordenadas por um dado que não existe).
3. `distanceMeters`/`durationSeconds` são **sempre `null`** — nunca calculados/inventados.
4. Paradas cujo `Location.address` está vazio são sinalizadas (`hasAddress: false` por item, mais
   uma mensagem agregada em `limitations`) — é a real "localização insuficiente" possível de
   detectar hoje, com dado já existente (não uma coordenada que nunca foi capturada).

Isso **não é** otimização de frota (regra 11: não há múltiplos veículos/viagens envolvidos, só a
ordem de uma lista) nem previsão avançada de ETA (regra 12: nada é calculado, o dado usado é o que
o planejador já digitou manualmente).

## 3. Origem dos dados

| Dado | Origem | Real ou inventado |
|---|---|---|
| Paradas da viagem | `TripDeliveryStop` (Fase 88), via `TripDeliveryStopsService.findAllForTrip` | Real |
| Ordem sugerida | `TripDeliveryStop.plannedArrival`, já digitado pelo planejador | Real |
| Distância/tempo | — | **Não calculado** (`null` sempre) |
| "Provider configurado?" | `RoutingService.isProviderConfigured()` (Fase 26) | Real (informativo) |
| Endereço da parada | `Location.address` | Real |

## 4. Endpoints (`TripRoutingService`, `TripsController`)

| Método | Rota | Efeito |
|---|---|---|
| `GET` | `/trips/:id/delivery-stops/routing-suggestion` | Calcula e **retorna** a sugestão (sem persistir); permitido em qualquer status de viagem. |
| `POST` | `/trips/:id/delivery-stops/routing-suggestion/apply` | Recalcula a sugestão **no momento da chamada** (nunca confia num cálculo antigo enviado pelo cliente) e a aplica. |

`GET .../routing-suggestion` nunca grava nada (regra 4: só uma ação explícita altera a rota
atual). `POST .../apply` **ignora qualquer corpo** — sempre recomputa a sugestão a partir do
estado atual do banco e a aplica, eliminando qualquer risco de o cliente enviar uma ordem
divergente do que foi de fato mostrado ao usuário.

## 5. Regras de aplicação

- **Reaproveita `TripDeliveryStopsService.reorder`** (Fase 88) para persistir a nova sequência —
  a mesma validação de que `items` cobre exatamente as paradas do tenant/viagem (regra 7) e forma
  `1..N` sem lacunas/duplicatas (regra 6), sem nenhuma lógica duplicada.
- **Trava de planejamento reaproveitada** (`assertTripPlanningAllowed`, extraída de
  `TripDeliveryStopsService` para `trips/utils/trip-planning-lock.util.ts` e usada por ambos os
  services): aplicar é bloqueado (`409`) quando a viagem já partiu (`Trip.actualDeparture`
  setado) ou está `CANCELLED` — regra 6 do pedido ("não alterar viagem já iniciada de forma
  incompatível"). Consultar a sugestão (`GET`) continua permitido mesmo depois da partida (é
  somente leitura, sem risco).
- **Idempotente**: quando a sequência recalculada já é igual à atual, `apply` responde
  `{ applied: false, routeVersionId: null, routeVersionNumber: null }` sem nenhuma escrita —
  "preservar a sequência atual quando não aplicada" nunca depende do usuário se abster de clicar;
  mesmo clicando, nada muda se não há nada a mudar.

## 6. Versionamento da rota

Reaproveita `RouteVersion` (regra 3), já documentada no schema como o lugar certo para acumular
"replanejamentos" de uma viagem — nenhuma tabela nova. Quando `apply` de fato reordena algo, uma
nova `RouteVersion` é criada (`versionNumber` = máximo atual + 1, `reason: STOP_RESEQUENCE`, novo
valor do enum `RouteVersionReason`) na mesma migration desta fase — sem geometria (nunca
calculada) e sem `RouteEvent` associado (mesmo padrão já usado pela versão `INITIAL`, criada sem
evento em `TripsService.create`). `GET /trips/:id/route-versions` (endpoint já existente, Fase 23)
passa a devolver o histórico completo automaticamente — nenhum endpoint novo de listagem foi
necessário.

## 7. Frontend (`apps/admin-web`)

A aba **"Paradas/Entregas"** (`delivery-stops-tab.tsx`) ganhou um cartão "Roteirização" acima da
tabela de paradas, reaproveitando `Card`/`Button`/`Badge` já existentes — nenhum componente novo
de tabela/gráfico criado:

- **"Solicitar roteirização"** chama o `GET` acima e guarda o resultado em estado local (nunca
  altera a lista de paradas sozinho).
- Mostra as **limitações reais** retornadas pelo backend (ex.: "distância/tempo não calculados
  nesta instalação", paradas sem endereço) — nunca um número fabricado.
- Quando `changed: true`, mostra uma tabela comparativa (sequência atual → sugerida, cliente/
  local, previsão de chegada) e o botão **"Aplicar sugestão"** (desabilitado, com explicação,
  quando a viagem já partiu). Quando `changed: false`, mostra "a sequência sugerida é igual à
  atual" sem botão de aplicar.
- A ordenação **manual** (subir/descer, Fase 88) continua disponível e intacta — a sugestão é só
  mais uma forma de preencher a mesma ação de reordenar, nunca a substitui.
- Distância/tempo nunca aparecem como campo numérico nesta fase (sempre `null`) — a limitação é
  comunicada em texto, nunca com um "0 km" ou "—" que pudesse ser confundido com um valor real.

## 8. Driver App (`apps/driver-app`)

**Nenhum endpoint novo foi necessário.** `GET /driver/trips/:id/delivery-stops` (Fase 88) já
devolve `TripDeliveryStop.sequence` — o mesmo campo que `apply` atualiza. Aplicar uma sugestão é,
para o app do motorista, indistinguível de uma reordenação manual: ele lê a sequência vigente, seja
qual for sua origem. Documentado esse reaproveitamento em `driverTrips.types.ts`. Nenhuma
navegação GPS, rastreamento em tempo real ou leitura da sugestão *não aplicada* (essa é uma
ferramenta de planejamento administrativo) foi implementada — fora de escopo desta fase.

## 9. Performance (sem N+1)

`buildSuggestion` é uma função pura (nunca consulta o banco) que recebe as paradas já carregadas
em lote por `TripDeliveryStopsService.findAllForTrip` (2 queries fixas, Fase 88 — trip + paradas
com `include`). `GET .../routing-suggestion` e `POST .../apply` seguem esse mesmo custo fixo,
independente do número de paradas — coberto por teste que conta queries reais com 5/15/30 paradas.

## 10. Limitações reais (documentadas, não escondidas)

- **Distância e tempo entre paradas nunca são calculados nesta fase.** Não há coordenada
  geográfica capturada para `Location` nesta instalação, e o provedor de roteirização existente
  (Fase 26) não é usado para múltiplas paradas — mesmo quando `GOOGLE_ROUTES_API_KEY` estiver
  configurada em outra instalação, essa limitação de dado (falta de coordenadas por `Location`)
  continuaria valendo até uma fase futura capturar/geocodificar endereços.
- A sugestão de sequência depende inteiramente de `plannedArrival` ter sido informado pelo
  planejador; sem essa previsão em nenhuma parada, a sugestão preserva a ordem atual
  (`changed: false`).
- Roteirização geográfica real, otimização multi-veículo/frota (Fase futura) e previsão avançada
  de chegada (Fase 91) estão **fora de escopo** desta fase, propositalmente.

## 11. Testes

`apps/api/test/trip-routing.e2e-spec.ts` (12 testes, requests reais contra o Postgres): sugestão
com múltiplas paradas ordenando por `plannedArrival`, preservação de ordem sem previsão,
`changed: false` quando nada muda, sinalização de parada sem endereço, sugestão consultável após a
partida, aplicação com criação de `RouteVersion`, preservação da sequência quando `apply` nunca é
chamado, no-op idempotente sem nova versão, bloqueio por status da viagem (partida/cancelada),
isolamento multi-tenant, RBAC de leitura/escrita e ausência de N+1. Suítes
`trips.e2e-spec.ts`, `driver-trips.e2e-spec.ts`, `routing.e2e-spec.ts` e
`trip-delivery-stops.e2e-spec.ts` reexecutadas e continuam passando sem alteração.
