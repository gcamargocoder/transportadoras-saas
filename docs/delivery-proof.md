# Comprovante de Entrega — POD (Fase 100)

## 1. Contexto e auditoria prévia

Antes de codificar, foi auditado tudo que já existia sobre documentos/anexos e comprovante de entrega:
`Document`/`Attachment` (mecanismo genérico de storage, Fase 48), `FiscalDocument` (Fase 52 — já com um
`documentType=DELIVERY_PROOF` completo desde a Fase 56), `FiscalDocumentsController`/`FiscalDocumentsService`
(upload/import/update/remove/dashboard/status por viagem), `POST /driver/trips/:id/delivery-proof` (Fase
56 — submissão pelo Driver App, idempotente por `deviceEventId`, com validação de assinatura binária do
arquivo), `trip-compliance.util.ts` (`DeliveryProofStatus` derivado da matriz documental) e `TripDeliveryStop`
(Fase 88/99). **Não havia nenhuma lacuna de mecanismo de arquivo/documento** — o sistema já tinha um POD
funcional, testado e usado tanto pelo Driver App quanto pelo painel administrativo.

A única lacuna real identificada, e o único ponto que esta fase evolui, foi: **o comprovante de entrega
não tinha vínculo com a parada/entrega específica (`TripDeliveryStop`)** — só com a viagem inteira
(`tripId`). Isso é um problema real em viagens com múltiplas paradas (Fase 88/99): não havia como saber
*qual* entrega da viagem aquele comprovante evidenciava.

### Reaproveitado sem duplicação

- **`FiscalDocument`/`Attachment`** — nenhum model novo. O POD continua sendo exatamente o mesmo
  `FiscalDocument` com `documentType=DELIVERY_PROOF`, arquivo no mesmo `Attachment`/storage já existente.
- **`POST /fiscal/documents/upload`** (administrativo) e **`POST /driver/trips/:id/delivery-proof`**
  (Driver App) — os dois pontos de escrita já existentes, ambos apenas evoluídos com um campo novo
  (`tripDeliveryStopId`), nenhum endpoint novo.
- **Validação de arquivo, storage, limite de plano, idempotência por `deviceEventId`** — tudo
  reaproveitado sem alteração.
- **`AuditService`** — as mesmas ações já auditadas (`fiscal.document_uploaded`,
  `fiscal.delivery_proof_submitted`, `fiscal.document_linked`) passam a incluir `tripDeliveryStopId` no
  payload, sem nenhuma ação nova.
- **RBAC** (`FISCAL_DOCUMENTS_READ_ROLES`/`WRITE_ROLES`) e o `DriverGuard` do Driver App — reaproveitados
  sem alteração.
- **`GET /fiscal/documents`** (listagem/filtros) e **`GET /fiscal/documents/trip/:tripId/status`** — o
  mesmo endpoint de sempre, só com um filtro novo (`tripDeliveryStopId`) para a consulta "na entrega".

### Estrutura genuinamente nova

Uma única coluna: `FiscalDocument.tripDeliveryStopId` (opcional, `SetNull` ao remover a parada) + o índice
`(tenantId, tripDeliveryStopId)`. Nada mais.

## 2. Vínculo com `TripDeliveryStop` e a regra "somente para entrega concluída"

`tripDeliveryStopId` é opcional — viagens sem paradas planejadas (fluxo simples, só origem/destino)
continuam funcionando exatamente como antes (regressão da Fase 56, coberta por teste). Quando informado:

1. A parada precisa existir neste tenant e pertencer à mesma viagem do documento (senão `400`/`404`).
2. A parada precisa estar `COMPLETED` (senão `409`) — "permitir registrar comprovante somente para
   entrega concluída".

Esta regra **nunca foi aplicada retroativamente ao vínculo por `tripId` sozinho** (o fluxo já existente
desde a Fase 56, sem parada específica, continua sem essa exigência) — mudar isso quebraria o
comportamento já testado e em uso. A exigência de "concluída" é exclusiva do vínculo novo e mais preciso
(`tripDeliveryStopId`), nunca uma restrição inventada sobre o que já existia.

A validação está centralizada em `FiscalDocumentsService.assertDeliveryProofStopUsable`, chamada pelos
três pontos de escrita (`upload`, `update`, `submitDeliveryProofFromDriverApp`) — nunca duplicada.

## 3. Múltiplas evidências

Cada chamada de upload/submissão cria uma nova linha de `FiscalDocument` (mesmo padrão já existente desde
a Fase 56 — a idempotência é só por `deviceEventId`, nunca por parada). Duas fotos diferentes da mesma
entrega = duas linhas de `FiscalDocument`, ambas com o mesmo `tripDeliveryStopId` — múltiplas evidências
por parada funcionam automaticamente, sem nenhum mecanismo adicional.

## 4. Preservação de histórico

`DELETE /fiscal/documents/:id` agora **bloqueia (409)** quando `documentType=DELIVERY_PROOF`, vinculado ou
não a uma parada — "POD deve preservar histórico; nunca apagar silenciosamente evidências já registradas".
Correção de vínculo/status continua possível via `PATCH` (ex.: desvincular uma parada errada, marcar
`INVALID`/`CANCELLED` na revisão) — só a remoção definitiva do registro é bloqueada. Demais tipos de
documento fiscal continuam removíveis exatamente como antes (regressão coberta por teste).

## 5. Consulta — na entrega, na viagem, no detalhe administrativo

- **Na entrega**: `GET /fiscal/documents?tripDeliveryStopId=X` (novo filtro) — usado pela aba "Entregas"
  da viagem (nova coluna "Comprovantes", com contagem e um modal de consulta por parada).
- **Na viagem**: `GET /fiscal/documents?tripId=X` e `GET /fiscal/documents/trip/:tripId/status` —
  inalterados, continuam retornando todos os documentos da viagem (vinculados a uma parada ou não).
- **No detalhe administrativo**: `GET /fiscal/documents/:id` — a aba "Documentos fiscais" da viagem já
  existente (Fase 52+) e o drawer de detalhe agora mostram a parada vinculada (`#N`), quando houver.

## 6. Driver App

`POST /driver/trips/:id/delivery-proof` (já existente) ganhou o campo opcional `tripDeliveryStopId` no
corpo multipart — mesma rota, mesma idempotência, mesma validação de arquivo. `vehicleId`/`driverId`/
`customerId` continuam sempre derivados no servidor (nunca aceitos do cliente); `tripDeliveryStopId` é o
único vínculo operacional que o app efetivamente escolhe, e mesmo assim validado no servidor contra a
viagem do motorista autenticado. Os tipos/cliente HTTP do app (`driverTrips.types.ts`/`driverTrips.api.ts`)
foram atualizados para refletir o campo desde esta fase — mas **nenhuma tela ainda coletava/enviava esse
campo**, então na prática todo comprovante submetido pelo app ficava sem parada vinculada, e o modal
"Comprovantes" da seção 5 sempre aparecia vazio.

**[Fase 106]** Fechada essa lacuna: a nova tela `DeliveryStopsScreen` ("Entregas", ver
`docs/trip-delivery-stops.md` seção 7) oferece "Anexar comprovante" por parada `COMPLETED`, navegando para
`DeliveryProofScreen` já com `tripDeliveryStopId` preenchido; a tela repassa o campo até `submitOrQueue`
(fila offline) e daí até este mesmo endpoint — nenhuma mudança de contrato HTTP foi necessária (o campo já
existia desde a Fase 100). O fluxo genérico sem parada (botão "Comprovante de entrega" já existente na
Home) continua funcionando exatamente como antes.

## 7. APIs alteradas (`apps/api/src/fiscal`, `apps/api/src/driver-trips`)

| Método | Rota | O que mudou |
|---|---|---|
| `POST` | `/fiscal/documents/upload` | Aceita `tripDeliveryStopId` opcional |
| `PATCH` | `/fiscal/documents/:id` | Aceita `tripDeliveryStopId` opcional (envie `null` para desvincular) |
| `DELETE` | `/fiscal/documents/:id` | Bloqueia (409) quando `documentType=DELIVERY_PROOF` |
| `GET` | `/fiscal/documents` | Novo filtro `tripDeliveryStopId` |
| `POST` | `/driver/trips/:id/delivery-proof` | Aceita `tripDeliveryStopId` opcional |

Nenhuma rota nova — todas já existiam desde as Fases 52/56.

## 8. Frontend (`apps/admin-web`)

- **`UploadFiscalDocumentModal`**: quando `documentType=DELIVERY_PROOF` e a viagem já está fixa (aberto a
  partir do detalhe da viagem), mostra um seletor opcional das paradas `COMPLETED` dessa viagem.
- **`FiscalDocumentDetailDrawer`**: mostra a parada vinculada (`#N`) quando houver; oculta o botão
  "Remover documento" para `DELIVERY_PROOF` (o backend já bloqueia — a UI evita a tentativa previsível).
- **`FiscalTab`** (aba "Documentos fiscais" da viagem): cada comprovante de entrega mostra um badge "Parada
  #N" ou "Sem parada vinculada".
- **`DeliveryStopsTab`** (aba "Entregas" da viagem, Fase 99): nova coluna "Comprovantes" — contagem por
  parada `COMPLETED` (buscada uma única vez para a aba inteira e agrupada em memória, nunca uma consulta
  por linha), com um modal (`DeliveryStopProofsModal`) para consultar/abrir os comprovantes daquela parada
  especificamente, reaproveitando o mesmo drawer de detalhe.

## 9. Performance / N+1

- Todas as consultas de `FiscalDocument` continuam usando o mesmo `FISCAL_DOCUMENT_INCLUDE` único e
  centralizado (Fase 52+), agora com mais um `select` leve (`tripDeliveryStop: { select: { sequence: true } }`)
  — um `JOIN` dentro da mesma query, nunca uma consulta adicional por documento.
- A nova coluna "Comprovantes" na aba de entregas busca os comprovantes da viagem **uma única vez** para
  a aba inteira (`GET /fiscal/documents?tripId=X&documentType=DELIVERY_PROOF`) e agrupa por parada em
  memória no frontend — nunca uma requisição por parada.
- Testado: contagem de queries de `GET /fiscal/documents?tripId=X` fixa entre 5 e 20 viagens com parada
  concluída + comprovante vinculado.

## 10. Limitações reais (regra 10 das fases anteriores — documentadas, não inventadas)

- **Fluxo completo no Driver App implementado na Fase 106** — ver seção 6; até então só a API estava
  preparada.
- **Sem ocorrências nem Torre de Controle** — fora de escopo, como pedido; "problema" na entrega continua
  representado apenas pelo status `FAILED` de `TripDeliveryStop` (Fase 99), nunca um registro de
  ocorrência formal vinculado ao POD.
- **A regra "somente entrega concluída" não se aplica ao vínculo legado por `tripId` sozinho** — decisão
  deliberada para não quebrar o fluxo já existente e testado desde a Fase 56 (viagens sem paradas
  planejadas continuam podendo registrar comprovante a qualquer momento da viagem, exatamente como antes).
- **Nenhuma geolocalização/assinatura digital é capturada** — o POD continua sendo um arquivo (foto/PDF)
  com metadados textuais, mesmo formato já suportado desde a Fase 56; captura de coordenadas/assinatura
  não existe em nenhuma parte do sistema hoje.

## 11. Testes

`apps/api/test/fiscal-documents.e2e-spec.ts`, bloco "Fase 100" (13 testes novos, requests reais contra o
Postgres): upload vinculado a parada `COMPLETED`, bloqueio (409) para parada não concluída (com sucesso
após concluir), rejeição (400) de parada de outra viagem, rejeição (404) de parada inexistente, múltiplas
evidências para a mesma parada, consulta "na entrega" (`tripDeliveryStopId`) vs. "na viagem" (`tripId`),
vincular/desvincular via `PATCH` respeitando a mesma regra, preservação de histórico (`DELETE` sempre
bloqueado para `DELIVERY_PROOF`, outros tipos continuam removíveis), submissão pelo Driver App exigindo
parada concluída, submissão pelo Driver App sem parada (regressão Fase 56), auditoria registrando o
vínculo, isolamento multi-tenant e RBAC (`AUDITOR` consulta mas não escreve/remove). Mais um teste de
ausência de N+1 dedicado no mesmo arquivo.

Regressão executada: suíte completa de `fiscal-documents.e2e-spec.ts` (72 testes), `driver-trips.e2e-spec.ts`
(comprovante de entrega + demais fluxos do Driver App) e `trip-delivery-stops.e2e-spec.ts` — todos
passando sem alteração de comportamento pré-existente.
