# Otimização de Frota para Viagens Planejadas (Fase 90)

## 1. Contexto e auditoria prévia

Antes de escrever qualquer código, foram auditados: `Vehicle` (incluindo `cargoCapacityKg`,
`grossWeightKg`, `axleCount`, `type`, `category`), `Driver` (`cnhCategory`, `cnhExpiresAt`,
`isAvailable`, `isActive`), `TripComposition`/`AxleConfiguration` (Fase 21),
`DriverVehicleAssignment` (Fase 61), `VehicleAvailabilityService`/`resolveVehicleAvailability`
(Fase 81/86), `TripsService.create`/`update`/`assertDriverAvailable`/`assertVehicleAvailable`/
`assertCompositionAvailable`/`assertCanStart` (Fase 14/87), e o frontend em
`apps/admin-web/src/app/(app)/trips/[id]/page.tsx`.

### Conclusão da auditoria

**`Trip` já exige `driverId` e `compositionId` na criação** — não existe "viagem sem
motorista/veículo" a ser preenchida. Ou seja, a Fase 90 não é sobre *atribuir* um veículo/
motorista pela primeira vez, é sobre **decidir se a combinação atual é a melhor disponível e,
se não for, trocar** — uma ação de replanejamento.

**"Aplicar uma seleção" já é, literalmente, `PATCH /trips/:id`** (`TripsService.update`,
Fase 14, endurecido na Fase 87) com `{ compositionId, driverId }`. Esse endpoint **já**:
- só aceita mudança com `trip.status === PLANNED` (regra 7 do pedido, já implementada);
- **já revalida** disponibilidade de motorista (`assertDriverAvailable`), veículo
  (`assertVehicleAvailable`) e composição (`assertCompositionAvailable`) no momento da escrita
  (regra 8, já implementada).

**Conclusão: nenhum endpoint de "aplicar" foi criado.** Criar um endpoint novo duplicaria
exatamente essa validação crítica já testada (65+ testes em `trips.e2e-spec.ts`), correndo risco
de divergir dela com o tempo. A Fase 90 implementa **somente a camada de análise** (um `GET`
somente leitura); a aplicação reaproveita 100% o fluxo de edição de planejamento já existente.
`TripsService.assertCanStart` **não foi tocado** (regra 9).

## 2. O que foi criado

`FleetOptimizationService` (`apps/api/src/trips/services/fleet-optimization.service.ts`) +
`GET /trips/:id/fleet-optimization`, expondo **candidatos** — cada candidato é sempre um **par**
(composição de frota + motorista), porque é exatamente isso que o `PATCH /trips/:id` aceita
aplicar de uma vez.

## 3. Critérios utilizados (e ordem/prioridade)

A análise é feita em duas etapas: **disponibilidade** (elimina candidatos) e **pontuação**
(ordena os que sobraram). Nunca o contrário — um candidato indisponível nunca é "pontuado para
cima" por nenhum outro critério.

### 3.1 Disponibilidade (elimina o candidato — regra 2, reaproveita o que já existe)

| Lado | Critério | Fonte | Reaproveita |
|---|---|---|---|
| Veículo | `Vehicle.status !== ACTIVE` | `Vehicle.status` | `resolveVehicleAvailability` (Fase 81/86) |
| Veículo | Conflito de agenda (outra viagem não-terminal sobrepondo o período) | `Trip.plannedDeparture/plannedArrival` | Mesma janela de `assertVehicleAvailable` |
| Motorista | `Driver.isAvailable === false` | `Driver.isAvailable` (indicação manual, Fase 61) | — |
| Motorista | `Driver.cnhExpiresAt` antes de `Trip.plannedDeparture` | `Driver.cnhExpiresAt` | — |
| Motorista | Conflito de agenda (mesma janela) | `Trip.plannedDeparture/plannedArrival` | Mesma janela de `assertDriverAvailable` |

Só motoristas `isActive=true` entram na análise (mesmo filtro já usado em `assertDriverAvailable`).
Uma composição só é candidata se estiver **livre** (`tripId: null`) **ou** for a **atual** desta
viagem — nunca uma composição já vinculada a outra viagem (mesma regra de
`assertCompositionAvailable`).

### 3.2 Pontuação (ordena os candidatos DISPONÍVEIS — regra 12: determinística, nunca IA/ML)

Soma simples de pontos, cada um documentado e rastreável até um dado real do banco:

| Pontos | Critério | Por quê é real (nunca inventado) |
|---|---|---|
| **+100** (piso) | Disponível (veículo **e** motorista) | Único jeito de entrar no ranking |
| **+20** | `DriverVehicleAssignment` **atual** (`endedAt: null`) ligando este motorista a este veículo | Fase 61 — vínculo operacional já cadastrado, nunca inferido |
| **+10** | Composição com `AxleConfiguration` cadastrada | Dado de qualidade que a própria viagem usa para pedágio (Fase 23/26) |

**Empate** é resolvido de forma determinística: placa do veículo (A→Z), depois nome do motorista
(A→Z) — nunca aleatório, nunca por ordem de inserção no banco.

### 3.3 Critérios que existem no banco mas **não** viraram pontuação (regra 4/5)

- **Capacidade de carga (`cargoCapacityKg`/`grossWeightKg`) e categoria do veículo**: exibidos no
  candidato (informativo), **nunca comparados** contra nada — `Trip`/`TripDeliveryStop` não
  possuem um peso/carga **exigido** pela viagem cadastrado em lugar nenhum. Comparar capacidade
  contra um requisito que não existe seria inventar dado (regra 4). Quando uma fase futura
  cadastrar peso/carga exigida pela viagem, este é o lugar certo para virar um critério real.
- **Categoria de CNH × tipo de veículo**: `Driver.cnhCategory` e `Vehicle.type` são exibidos lado
  a lado, mas **nenhuma regra de compatibilidade legal foi codificada** — não existe, no banco,
  uma tabela "tipo de veículo → categoria de CNH exigida" (regra 4: nada foi inventado a partir de
  conhecimento externo não cadastrado). Fica documentado como limitação, não como bug.

## 4. Cálculo da classificação (`rank`)

1. Elimina indisponíveis (nunca aparecem no ranking; `rank: null`).
2. Ordena os disponíveis por pontuação decrescente, com o desempate da seção 3.2.
3. `rank = posição + 1` (1 = melhor).
4. A **seleção atual** da viagem é sempre incluída na resposta — mesmo com pontuação baixa, ou
   mesmo **indisponível** (ex.: a CNH do motorista venceu depois que a viagem foi criada) — para
   nunca esconder do usuário que a combinação vigente pode ter deixado de ser válida.

## 5. Regras de aplicação

- **Nada é aplicado automaticamente** (regra 6) — a análise é somente leitura; aplicar exige o
  usuário escolher um candidato na tela e confirmar.
- **Aplicar = `PATCH /trips/:id`** (seção 1) — logo, só funciona com a viagem `PLANNED` (regra 7)
  e **revalida tudo de novo no momento da escrita** (regra 8): um candidato marcado "disponível"
  na análise pode ter sido reservado por outra viagem entre a consulta e o clique em "aplicar" —
  nesse caso o `PATCH` responde `409` normalmente, e o usuário precisa gerar uma nova análise.
- Ajuste manual (escolher qualquer veículo/motorista livre, sem passar pela otimização) continua
  disponível pelo modal "Editar planejamento" já existente — a Fase 90 é uma sugestão, nunca uma
  obrigação.

## 6. Frontend (`apps/admin-web`)

Nova aba **"Otimização de frota"** em `trips/[id]/page.tsx`
(`features/trips/tabs/fleet-optimization-tab.tsx`), reaproveitando `Card`/`Badge`/`Button` já
existentes: botão "Solicitar análise", tabela comparativa (veículo, motorista, disponibilidade,
pontuação, justificativa/restrições), seleção por rádio e "Aplicar seleção" — que chama o **mesmo**
`updateTrip(...)` (Fase 14/87) já usado por `UpdateTripPlanModal`, nenhuma mutação nova. O botão de
aplicar só fica ativo com a viagem em `PLANNED` (mesmo critério de `canEditPlan`, já usado pelo
botão "Editar planejamento" no cabeçalho da página).

## 7. Driver App

**Nenhuma mudança de código foi necessária.** `DriverTrip`/`DriverActiveTrip`
(`driverTrips.types.ts`) já expõem `vehiclePlate` derivado da composição atual da viagem
(`TripEntity.vehiclePlate`) — quando uma seleção da Fase 90 é aplicada, o app do motorista já
reflete o novo veículo/motorista automaticamente na próxima consulta, sem nenhum endpoint ou tipo
novo. Nenhuma navegação/fluxo do motorista foi alterado.

## 8. Performance (sem N+1)

Consultas em lote, fixas independente do tamanho da frota/equipe: viagem (1) + composições
candidatas (1) + motoristas ativos (1) + conflito de agenda de veículo (1) + conflito de agenda de
motorista (1) + vínculos motorista-veículo atuais (1) = **6 queries fixas**. O cruzamento
composição × motorista (produto cartesiano) é feito **inteiramente em memória**, limitado a no
máximo 15 composições × 15 motoristas (225 pares) por análise — a seleção atual da viagem é sempre
incluída mesmo fora desse corte. Coberto por teste que conta queries reais com 5/15/30
veículos+motoristas.

## 9. Limitações reais (documentadas, não escondidas)

- **Capacidade/peso do veículo nunca é comparado contra um requisito da viagem** — esse requisito
  não existe no banco nesta fase (ver seção 3.3).
- **Nenhuma regra de compatibilidade legal CNH × tipo de veículo** — não há tabela cadastrada para
  isso; os dois campos são exibidos lado a lado para o usuário decidir.
- **Sem ETA avançado** — a análise não estima horário de chegada nem tempo de viagem (Fase 91).
- **Sem otimização multi-viagem/multi-veículo** — cada análise resolve **uma** viagem por vez;
  não há balanceamento de frota entre viagens simultâneas (fora de escopo, regra 11).
- **Determinístico, não é IA/ML** — pontuação aditiva simples e auditável, nunca um modelo
  treinado ou heurística probabilística.

## 10. Testes

`apps/api/test/fleet-optimization.e2e-spec.ts` (13 testes, requests reais contra o Postgres):
seleção atual sempre presente, veículo em manutenção/motorista indisponível nunca aparecem
disponíveis, conflito de agenda por veículo e por motorista, pontuação por configuração de eixos
e por vínculo motorista-veículo, capacidade/peso nunca vira critério de pontuação, ranking
determinístico (mesma entrada → mesma ordem), aplicação via `PATCH /trips/:id` já existente,
revalidação no momento da aplicação (candidato que ficou indisponível entre análise e aplicação é
rejeitado), viagem já iniciada (análise permanece legível, aplicação bloqueada), isolamento
multi-tenant, RBAC e ausência de N+1. `trips.e2e-spec.ts` (66 testes, suíte diretamente afetada
pela nova rota/export) reexecutada e continua passando sem alteração.
