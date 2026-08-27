# Cotações (Fase 94)

## 1. Contexto e auditoria prévia

Antes de codificar, foram auditados `Customer`/`CustomerContact` (Fase 93), `Location`, `Trip`,
`Contract`/`FreightTable`/`FreightRule`/`TripFreight` e o motor de precificação existente
(`FreightPricingService`, `computeFreightQuote`/`selectApplicableFreightRule`, Fase 59).

### Conclusão da auditoria

- **O motor de precificação já existe e é reutilizável sem alteração**: `FreightPricingService.simulate()`
  (rota já pública `POST /freight/simulate`) resolve tabela/regra vigente para um cliente e devolve um
  `FreightQuoteEntity` (`available`/`reason`/breakdown/`totalAmount`) **sem persistir nada**. A Fase 94
  chama exatamente esse método — nenhuma segunda implementação de cálculo foi criada (regra 3).
- **`TripFreight` já estabelece o padrão de snapshot** que a Fase 94 precisava replicar: valores gravados
  no momento do cálculo, ponteiros (`freightTableId`/`freightRuleId`) apenas para rastreabilidade
  (`onDelete: SetNull`), nunca reprocessados quando a tabela/regra de origem muda depois. `Quotation`
  segue o mesmo desenho.
- **`AuditService.findByEntity`** (já usado por `Vehicle`/`Tire`/`Maintenance`/`FiscalDocument`/`Tenant`)
  cobre integralmente "histórico básico de alterações" — nenhuma tabela de histórico paralela foi criada.
- **Nenhuma entidade "Proposta"/"Pipeline" existe** (fora de escopo, regra 9). A única "próxima etapa"
  que a arquitetura atual realmente suporta é `Trip` — por isso "conversão" (regra 10) significa criar
  uma `Trip` real a partir de uma cotação `APPROVED`, reaproveitando `TripsService.create` sem nenhuma
  segunda lógica de criação de viagem.
- **Não há listagem top-level de Contratos/Tabelas/Regras de frete** neste projeto (só são geridos
  embutidos na página de detalhe do cliente). Como a Fase 94 pede explicitamente listagem paginada,
  busca e filtros por cliente/status/período — um escopo mais amplo que "gerido de dentro do cliente" —
  Cotações ganhou uma área própria (`/quotations`), no padrão de Clientes/Viagens.

## 2. Modelo de dados (`Quotation`)

Campos obrigatórios: `customerId`, `originLocationId`, `destinationLocationId`, `validUntil`, `status`
(default `DRAFT`), `amountSource`, `amount`. Demais campos são opcionais: `customerContactId` (Fase 93),
`cargoType`, `weightKg`, `cubageM3`, `vehicleType`, `conditions`.

**Snapshot do valor** (nunca reprocessado retroativamente — regra 5): `freightTableId`/`freightRuleId`
(ponteiros, `onDelete: SetNull`), `baseAmount`/`additionsAmount`/`tollAmount`/`feesAmount`
(breakdown do motor), `calculatedAmount` (valor bruto sugerido, preservado mesmo quando sobrescrito
manualmente) e `calculationInput` (echo completo dos parâmetros usados, para auditoria/reprodutibilidade
— mesmo princípio de `TripFreight.calculationInput`).

**Conversão**: `convertedTripId` (único, `onDelete: SetNull`) aponta para a `Trip` criada, quando houver.

Migração: `packages/database/prisma/migrations/20260831000000_quotations/`.

## 3. Ciclo de status

```
DRAFT --(SENT)--> SENT --(APPROVED)--> APPROVED --(convert-to-trip)--> CONVERTED [final]
  |                 |                     |
  +--(CANCELLED)    +--(REJECTED)[final]  +--(CANCELLED)[final]
  |                 +--(CANCELLED)[final]
  +--(CANCELLED)[final]
```

Seis estados, sem estado "EXPIRED" próprio (regra 6 — "sem criar estados desnecessários"): validade é
sempre **derivada** de `validUntil < agora` (campo `expired`, calculado a cada leitura, nunca uma
transição de status que alguém escolhe — mesmo princípio de `computeTripOccurrenceStatus`). Uma cotação
pode estar `expired: true` e continuar `DRAFT`/`SENT` — o sistema nunca decide sozinho que ela "morreu";
isso é visível na UI (badge "Expirada") e cabe ao usuário cancelar se for o caso.

`REJECTED`/`CONVERTED`/`CANCELLED` são finais: nenhuma transição de status sai deles, e nenhuma edição
de conteúdo é aceita (`PATCH /quotations/:id` retorna 409) — regra 7. `CONVERTED` nunca é definido
diretamente via `PATCH /quotations/:id/status` (409 explícito) — só por
`POST /quotations/:id/convert-to-trip`.

## 4. Origem do valor (`amountSource`)

1. Na criação/edição, o backend chama `FreightPricingService.simulate()` com os parâmetros da cotação.
2. Se `quote.available === true`: o valor calculado (`quote.totalAmount`) é usado, `amountSource =
   CALCULATED`, salvo quando `manualAmount` foi explicitamente informado (decisão comercial humana,
   mesmo espírito de `TripFreight.contractedAmount` sobre `estimatedAmount`) — nesse caso
   `amountSource = MANUAL`, mas `calculatedAmount` continua preservado para auditoria ("o motor sugeriu
   X, foi cotado Y").
3. Se `quote.available === false` (nenhuma tabela/regra aplicável): a API exige `manualAmount`
   (`409 Conflict` explicando o motivo quando ausente) — regra 4. Nunca inventa um preço.

## 5. Snapshot e regra 5 (preservação de valor/condições)

- `POST /quotations` sempre grava um snapshot novo.
- `PATCH /quotations/:id` **só recalcula quando o próprio pedido de edição muda um parâmetro relevante
  ao cálculo** (`customerId`, `originLocationId`, `destinationLocationId`, `cargoType`, `vehicleType`,
  `weightKg`, `cubageM3`, `freightTableId`, `nightService`, `riskCargo`, `dailyCount`,
  `demurrageCount`, `manualAmount`). Editar apenas `conditions`/`customerContactId`/`validUntil` nunca
  reprocessa o valor já gravado.
- Uma `FreightRule`/`FreightTable` sendo revisada/editada depois de uma cotação já criada **nunca**
  altera essa cotação — os campos ficam congelados no momento em que foram calculados. Coberto por teste
  (`snapshot do valor/condicoes`).

## 6. Regras de validade

- `validUntil` é obrigatório na criação.
- `expired` é sempre derivado (`validUntil < now()`), nunca persistido.
- Não há bloqueio automático de transição por expiração (não pedido pelo escopo desta fase) — a UI
  destaca claramente "Expirada" para o usuário decidir a ação (ex.: cancelar).

## 7. Integrações (reuso, sem duplicação)

- **Customer/CustomerContact (Fase 93)**: `customerId` obrigatório; `customerContactId` opcional,
  validado como pertencente ao mesmo cliente.
- **Location**: origem/destino validados como existentes no tenant.
- **FreightPricingService.simulate (Fase 59)**: único motor de cálculo, nunca duplicado.
- **TripsService.create**: `POST /quotations/:id/convert-to-trip` reaproveita integralmente a criação de
  viagens — a cotação fornece `customerId`/`originLocationId`/`destinationLocationId`/`conditions`
  (como `notes` da viagem); motorista/composição/datas são pedidos no próprio endpoint, porque são
  atribuição operacional que uma cotação comercial nunca teria (nunca inventados).
- **AuditService.findByEntity**: histórico básico de alterações, mesmo padrão de outros módulos
  (`GET /quotations/:id/history`).

## 8. APIs (`apps/api/src/quotations`)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/quotations` | Lista (busca, filtro cliente/status/período, paginação) |
| `GET` | `/quotations/:id` | Detalhe |
| `GET` | `/quotations/:id/history` | Histórico básico de alterações (AuditLog) |
| `POST` | `/quotations` | Cria (calcula ou exige `manualAmount`) |
| `PATCH` | `/quotations/:id` | Edita (somente DRAFT/SENT) |
| `PATCH` | `/quotations/:id/status` | Transição de status |
| `POST` | `/quotations/:id/convert-to-trip` | Converte cotação APPROVED em Trip real |

RBAC: mesmo grupo operacional do módulo Freight (`FREIGHT_READ_ROLES`/`FREIGHT_WRITE_ROLES`,
reaproveitados diretamente — leitura inclui `AUDITOR`, escrita não inclui `DRIVER`). Sem gate de
`TenantModule` (mesmo critério já usado pelo CRM da Fase 93): funciona mesmo em tenants sem o módulo
FREIGHT habilitado, caindo graciosamente para `manualAmount` quando não há tabela/regra disponível.

## 9. Frontend (`apps/admin-web`)

- **`/quotations`**: listagem paginada, busca, filtros por cliente/status/período, criação.
- **`/quotations/:id`**: resumo (valor/origem do valor/validade/criação), transições de status
  disponíveis, edição (somente enquanto DRAFT/SENT), conversão em viagem (somente APPROVED), detalhes de
  carga/veículo, condições, composição do valor calculado (quando `CALCULATED`), histórico de alterações
  e link para o cliente relacionado.
- Reaproveita integralmente `DataTable`/`Card`/`FilterBar`/`Modal`/`Pagination`/`StatCard`/`EntitySelect`/
  `Badge`/`DatePicker` já existentes — nenhum componente de UI genérico novo.

## 10. Performance / N+1

- Listagem: filtros/busca/paginação inteiramente no banco (`where`/`skip`/`take` do Prisma), com um
  único `include` para os nomes relacionados (cliente/contato/origem/destino/tabela/regra/criador/
  atualizador) — sem consulta por linha. Testado: contagem de queries fixa entre 5 e 20 cotações.
- Criação/edição: uma chamada a `FreightPricingService.simulate` (que já é O(1) em relação ao número de
  cotações — busca tabelas/regras do cliente, nunca de todas as cotações).

## 11. Limitações reais (documentadas, não escondidas)

- **Sem Pipeline/CRM avançado/Propostas/Renovação de contratos** (regra 9) — cada cotação é um registro
  isolado; não há estágios de funil nem histórico agregado entre cotações do mesmo cliente nesta fase.
- **Conversão em viagem não aplica nenhum cálculo financeiro à `Trip` criada** (regra 10): o valor já
  cotado não é automaticamente propagado para `TripFreight`. Isso continua sendo uma ação separada e
  deliberada via `POST /freight/trips/:tripId/apply` (já existente) — evita qualquer nova funcionalidade
  financeira nesta fase.
- **Modificadores avançados do motor de cálculo** (`nightService`, `riskCargo`, `dailyCount`,
  `demurrageCount`, `freightTableId` específico) existem na API mas não são expostos no formulário desta
  fase — o formulário cobre exatamente os campos pedidos no escopo (cliente, contato, origem/destino,
  carga, peso/volume, condições, validade, valor). Ficam disponíveis para uma evolução futura da UI.
- **Sem paginação em `/quotations/:id/contacts`-like** não se aplica aqui (não há sub-recursos de
  cotação além do histórico, que já é paginado).
- **Nenhum vínculo de volta em `Trip`** além do ponteiro opcional (`Trip.sourceQuotation`) — a viagem
  convertida funciona normalmente por todos os fluxos operacionais já existentes, sem nenhuma alteração
  de comportamento.

## 12. Testes

`apps/api/test/quotations.e2e-spec.ts` (14 testes, requests reais contra o Postgres): criação com valor
calculado e com valor manual (incluindo o 409 quando nenhum dos dois é possível), snapshot do valor
preservado após revisão da `FreightRule` de origem (dois cenários: PATCH que só muda `conditions` nunca
recalcula; PATCH que muda `weightKg` recalcula deliberadamente), validade derivada (`expired`), ciclo
completo de status até `CONVERTED` com conversão real em `Trip`, bloqueio de transição inválida,
bloqueio de edição/transição após estado final (`REJECTED`), `convert-to-trip` exigindo `APPROVED`,
integração com `Customer`/`CustomerContact` (contato de outro cliente rejeitado), histórico básico,
isolamento multi-tenant, RBAC (`DRIVER` bloqueado, `AUDITOR` só leitura) e ausência de N+1. Regressão
executada em `freight.e2e-spec.ts`, `trips.e2e-spec.ts` e `customer-crm.e2e-spec.ts` (99 testes,
diretamente afetadas por dependerem de `FreightPricingService`/`TripsService`/`Customer`) — todas
passando sem alteração.
