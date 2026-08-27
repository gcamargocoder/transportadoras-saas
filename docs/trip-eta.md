# Previsão de Chegada — ETA (Fase 91)

## 1. Contexto e auditoria prévia

Antes de escrever qualquer código, foram auditados: `Trip` (`plannedDeparture`/`plannedArrival`/
`actualDeparture`/`actualArrival`/`status`/`destinationLocationId`), `TripDeliveryStop` (Fase 88),
`RouteVersion`/`RoutePlan`/`RouteEvent` (Fase 23/26/89), `TrackingPoint` (telemetria/GPS real do
Driver App, Fase 25/28), `RoutingService`/`RoutingProviderPort` (Fase 26), `TripMetrics`, e o
frontend/Driver App relacionados a viagem e paradas.

### Conclusão da auditoria

- **Nenhuma coordenada é capturada por `TripDeliveryStop`/`Location`** (confirmado nas Fases 89/90:
  `Location.geoPoint` nunca é populado). Ou seja, **não existe, hoje, como calcular ETA geográfico
  para uma parada intermediária arbitrária** — não há nenhuma coordenada cadastrada para ela.
- **`RoutePlan` (Fase 26) é a única estrutura com coordenadas reais**: `originLatitude/Longitude`,
  `destinationLatitude/Longitude`, `distanceMeters`, `durationSeconds` e a `encodedPolyline` — todos
  vindos do `RoutingProviderPort` quando configurado. Como `Trip.destinationLocationId` é um campo
  simples (comparável por igualdade, sem precisar de coordenada), é possível saber com certeza
  **quando uma `TripDeliveryStop` é o mesmo local do destino final da viagem** — o único ponto do
  trajeto com posição conhecida.
- **`TrackingPoint` é telemetria real** (Fase 25/28) — posição e velocidade reportadas pelo Driver
  App. `RoutingService.getDriverView` já usa a última posição projetada na polyline
  (`distanceFromOriginMeters`) para calcular distância restante — a Fase 91 reaproveita literalmente
  os mesmos utilitários puros (`decodePolyline`, `cumulativeDistancesMeters`,
  `distanceFromOriginMeters`), nunca uma segunda implementação.
- **`RouteEvent`** foi auditado e não guarda nenhum dado numérico aproveitável para ETA (é um
  registro de evento — desvio, acidente, obra — não uma medição); não é usado no cálculo.
- **Nenhuma estrutura existente é adequada para persistir uma previsão** — `TripMetrics` guarda
  KPIs agregados fechados no fim da viagem (não uma previsão contínua), `RouteVersion`/`RoutePlan`
  guardam a rota em si, não uma previsão de horário por parada. Conclusão: **ETA nunca é
  persistida** (regra 13) — é recalculada em toda consulta, exatamente como a sugestão de
  roteirização da Fase 89.

## 2. Método de cálculo (dois motores, do mais para o menos preciso)

`TripEtaService.compute` (`apps/api/src/trips/services/trip-eta.service.ts`), puramente de leitura:

### 2.1 GEOGRAPHIC (real, quando os dados existem)

Exige **todos** os seguintes dados reais, simultaneamente:
1. `Trip.routePlanId` apontando para um `RoutePlan` calculado (Fase 26 — via
   `RoutingProviderPort`, reaproveitado sem alteração, regra 2/8);
2. pelo menos um `TrackingPoint` real registrado para a viagem (Fase 25/28, regra 3);
3. a parada em questão ser a que tem `locationId === Trip.destinationLocationId` — comparação por
   **id**, nunca por coordenada aproximada.

Cálculo: `distanceRemainingMeters = max(0, RoutePlan.distanceMeters − distanceFromOriginMeters(últimaPosição, polyline))`.
Velocidade média: quando há `TrackingPoint.speedKmh` real nos últimos 15 minutos, usa a **média
real dessas leituras**; senão, cai para a velocidade média da própria rota
(`RoutePlan.distanceMeters / RoutePlan.durationSeconds`, também real, vinda do provider). `ETA =
últimaPosição.recordedAt + distanceRemainingMeters / velocidadeMédia`.

**Só se aplica a uma parada possível** (a última, quando seu `locationId` é o destino final da
viagem) — as demais nunca têm coordenada conhecida, então nunca recebem ETA geográfico (regra 1/4:
nunca se inventa a posição de uma parada intermediária).

### 2.2 DELAY_SHIFT (fallback, sem geografia)

Quando a viagem já partiu de fato (`Trip.actualDeparture` real, gravado pelo mesmo mecanismo já
existente de início de viagem — regra 7, nenhuma alteração na máquina de estados) mas o cálculo
geográfico não é possível: `atrasoReal = actualDeparture − plannedDeparture` (segundos, real).
`ETA da parada = TripDeliveryStop.plannedArrival + atrasoReal`. Puramente aritmético sobre datas
reais — nenhuma coordenada, nenhuma velocidade.

### 2.3 NONE (sem dado suficiente)

Quando nem 2.1 nem 2.2 se aplicam — ex.: viagem ainda não partiu, ou a parada não tem
`plannedArrival` cadastrado. `estimatedArrival: null`, com `limitation` explicando exatamente o
motivo (regra 4/12 — nunca um valor vazio sem explicação).

Uma parada `COMPLETED`/`CANCELLED` nunca recebe cálculo (já aconteceu ou foi descartada).

## 3. Regras de atualização

Não há "atualização" no sentido de um job/cache — **cada chamada recalcula do zero** a partir do
estado atual do banco (`RoutePlan` corrente, último `TrackingPoint`, atraso real de partida). Assim
que o Driver App envia uma nova posição de GPS (fluxo já existente, Fase 25/28, não alterado nesta
fase), a próxima consulta de ETA já reflete o dado mais recente automaticamente — sem nenhuma
lógica extra de invalidação/recomputação a manter.

## 4. Tratamento de dados ausentes

| Situação | Resultado |
|---|---|
| Viagem ainda não partiu | Sem ETA algum (`tripEstimatedArrivalSource: NONE`); `plannedArrival` continua visível; `limitations` explica |
| Viagem partiu, sem `RoutePlan` | Sem ETA geográfico; cai para `DELAY_SHIFT` quando a parada tem `plannedArrival` |
| Viagem partiu, com `RoutePlan`, sem `TrackingPoint` | Idem acima — geográfico exige posição real |
| Parada sem `plannedArrival` | `estimatedArrival: null`, `limitation` explica |
| Parada `COMPLETED`/`CANCELLED` | Nunca recebe ETA (`limitation: "já concluída ou cancelada"`) |
| Viagem `COMPLETED`/`CANCELLED` | Resposta inteira vazia/nula, com `limitations: ["já concluída/cancelada..."]` (regra: viagem em estado incompatível) |

## 5. Integração com `TripDeliveryStop`

Cada item de `stops[]` traz, lado a lado: `plannedArrival` (existente, Fase 88, nunca alterado),
`estimatedArrival` (novo, calculado), `source`, `basis` (explicação textual), `varianceSeconds`
(`estimatedArrival − plannedArrival`, positivo = atraso) e `delayed` — satisfazendo literalmente
"planejado × previsto" e "indicador de atraso" pedidos. `isNextStop` marca a primeira parada ainda
`PENDING`/`IN_PROGRESS` (menor `sequence`), reaproveitando a ordenação já existente da Fase 88 (a
mesma que a Fase 89 pode ter reordenado) — nenhuma lógica de sequência nova.

## 6. Frontend (`apps/admin-web`)

A aba **"Paradas/Entregas"** ganhou um cartão "Previsão de chegada" (destino final da viagem:
planejado × previsto, badge de atraso/adiantamento, texto da base do cálculo, limitações) acima do
cartão de roteirização já existente (Fase 89), e a coluna "Previsão de chegada" da tabela de
paradas virou "Planejado × previsto (ETA)", mostrando os dois valores, o badge de atraso e a
parada seguinte marcada com "Próxima". Busca automática (não é uma ação custosa como a
roteirização/otimização) — reaproveita `Card`/`Badge`/`DataTable` já existentes, nenhum componente
novo.

## 7. Driver App

`GET /driver/trips/:id/delivery-stops/eta`, reaproveitando o **mesmo** `TripEtaService` do painel
administrativo (nenhum motor de cálculo paralelo) — tipos e função de API adicionados
(`TripEtaResult`, `getEta`), **sem nenhuma tela nova** e **sem GPS/rastreamento em tempo real**
implementados nesta fase (regra 9) — o app já envia `TrackingPoint` desde a Fase 25/28; esta fase
só consome o que já existe.

## 8. Performance (sem N+1)

Consultas fixas, independentes do número de paradas: viagem (1) + paradas em lote (2, Fase 88) +
`RoutePlan` atual (0 ou 1) + última posição de GPS (0 ou 1) + telemetria recente para velocidade
média (0 ou 1) — no máximo **6 queries fixas**. O cálculo por parada (`buildStopEta`) é
inteiramente em memória (`stops.map(...)`), nunca uma consulta adicional por parada. Coberto por
teste que conta queries reais com 5/15/30 paradas.

## 9. Limitações reais (documentadas, não escondidas)

- **ETA geográfico só existe para UMA parada possível**: aquela cujo `locationId` é literalmente o
  destino final da viagem. Paradas intermediárias **nunca** recebem ETA geográfico nesta
  instalação — não há coordenada cadastrada para elas (mesma limitação já documentada nas Fases 89
  e 90).
- **Depende de `RoutePlan` existir**, que por sua vez depende de `GOOGLE_ROUTES_API_KEY` estar
  configurada (não está, nesta instalação — ver `docs/trip-routing.md`). Sem isso, todo o sistema
  cai graciosamente para `DELAY_SHIFT` — nunca um erro, nunca um valor inventado.
- **`DELAY_SHIFT` assume que o atraso de partida se propaga igualmente a todas as paradas** — não
  modela trânsito, paradas mais longas que o previsto, nem re-otimização de rota em tempo real.
  É uma heurística simples e honesta, não uma simulação de tráfego.
- **Sem ETA avançado** (Fase 92, fora de escopo) — nenhum modelo preditivo, machine learning ou
  ajuste por histórico de viagens semelhantes.

## 10. Testes

`apps/api/test/trip-eta.e2e-spec.ts` (12 testes, requests reais contra o Postgres; o provider de
roteirização é substituído por um FAKE determinístico via override de DI — mesmo padrão já
estabelecido em `routing.e2e-spec.ts`, já que nenhuma credencial real está configurada nesta
instalação): ETA geográfica exata (na origem e no destino), só a parada-destino recebe geográfico
enquanto as demais usam `DELAY_SHIFT`, planejado × previsto com atraso real medido, próxima parada
e múltiplas entregas, parada concluída nunca recebe ETA, ausência de `plannedArrival`, viagem ainda
não partida, viagem sem `RoutePlan`/GPS, viagem cancelada, isolamento multi-tenant, RBAC e ausência
de N+1. `trips.e2e-spec.ts` e `driver-trips.e2e-spec.ts` (suítes diretamente afetadas pela nova
rota/export) reexecutadas e continuam passando sem alteração.
