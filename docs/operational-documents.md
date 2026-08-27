# Documentos e Anexos da Operação (Fase 102)

## 1. Contexto e auditoria prévia

Antes de codificar, foi auditado tudo que já existia sobre documentos, anexos e evidências operacionais:
`FiscalDocument` (Fase 52 — documento fiscal/documental genérico, já vinculável a `Trip`/`Vehicle`/`Driver`/
`Customer`, e desde a Fase 100 também a `TripDeliveryStop`), `Attachment` (Fase 48 — arquivo genérico,
polimórfico via `entityName`/`entityId`, já reaproveitado por `FiscalDocument`, `ChecklistEvidence`,
`TripExpense`/`TripRevenue`/`TripAdvance`/`FuelSupply`), `Document`/`DocumentOwnerType` (Fase 48 — documento
formal de compliance de veículo/reboque/motorista/tenant — CRLV/ANTT/CNH/licenciamento/seguro — modelo
totalmente distinto e sem relação com a operação de uma viagem específica), `TripOccurrence` (Fase 67/101 —
já com um `attachmentId` único para evidência simples), `TripDeliveryStop` (Fase 88/99), o POD (Fase 56/100)
e o Driver App (`submitDeliveryProof`, `createOccurrence`).

**Não havia nenhuma lacuna de mecanismo de arquivo/documento** — o sistema já tinha um `FiscalDocument`
genérico, funcional, testado e usado tanto pelo Driver App quanto pelo painel administrativo, com
metadados essenciais (tipo, origem, responsável, data) já resolvidos desde a Fase 52/56.

### Gaps reais identificados

1. **`Trip`** — já coberto (`FiscalDocument.tripId`, desde a Fase 52). Nenhuma lacuna.
2. **`TripDeliveryStop`** — já coberto (`FiscalDocument.tripDeliveryStopId`, desde a Fase 100/POD). Nenhuma
   lacuna.
3. **`TripOccurrence`** — **lacuna real**: a única forma de anexar evidência a uma ocorrência era o campo
   único `TripOccurrence.attachmentId` (Fase 67), que aponta direto para um `Attachment` — mas **não existia
   (e continua não existindo fora deste mecanismo) nenhum endpoint que crie um `Attachment` isolado** para
   preencher esse campo. Na prática, o campo era inutilizável pelo painel administrativo ou pelo Driver App:
   nenhum fluxo de upload o alimentava. Além disso, mesmo que fosse alimentado, seria um vínculo único (1
   evidência por ocorrência), sem status de revisão, sem histórico de auditoria dedicado e sem consulta/
   filtro/paginação — muito mais limitado que o mecanismo já maduro de `FiscalDocument`.

A solução: **`FiscalDocument.tripOccurrenceId`**, um vínculo opcional adicional, exatamente no mesmo padrão
já usado por `tripDeliveryStopId` (Fase 100) — reaproveitando 100% do mecanismo de upload/consulta/status/
auditoria/preservação de histórico já existente, sem nenhum storage ou serviço paralelo.

### Reaproveitado sem duplicação

- **`FiscalDocument`/`Attachment`** — nenhum model novo. Evidência de ocorrência é exatamente o mesmo
  `FiscalDocument`, com um novo `documentType=OCCURRENCE_EVIDENCE` e o vínculo opcional `tripOccurrenceId`.
- **`POST /fiscal/documents/upload`** (administrativo) — o mesmo ponto de escrita já existente, apenas
  evoluído com um campo novo (`tripOccurrenceId`), nenhum endpoint novo.
- **`POST /driver/trips/:id/occurrences/:occurrenceId/evidence`** (Driver App) — **novo endpoint**, mas
  reaproveita integralmente `FiscalDocumentsService` (mesma validação de assinatura de arquivo, mesmo
  storage, mesma idempotência por `deviceEventId`) — o mesmo padrão de
  `POST /driver/trips/:id/delivery-proof` (Fase 56/100), nunca um serviço/storage paralelo.
- **Validação de arquivo, storage, limite de plano, idempotência por `deviceEventId`, auditoria,
  RBAC (`FISCAL_DOCUMENTS_READ_ROLES`/`WRITE_ROLES`)** — tudo reaproveitado sem alteração.
- **`GET /fiscal/documents`** (listagem/filtros) e **`GET /fiscal/documents/:id`** — o mesmo endpoint de
  sempre, só com mais um filtro (`tripOccurrenceId`) para a consulta "na ocorrência".
- **`Document`/`DocumentOwnerType`** (compliance de veículo/reboque/motorista/tenant) — **auditado, sem
  nenhuma evolução necessária**: é um modelo conceitualmente distinto (documentos formais do cadastro, não
  evidências de uma viagem/entrega/ocorrência específica) e nenhum requisito desta fase o alcança.
- **`TripOccurrence.attachmentId`** — mantido sem alteração (Fase 67, evidência única simples, continua
  aceitando um `Attachment` já existente quando informado na criação). O novo mecanismo
  (`FiscalDocument.tripOccurrenceId`) é uma camada adicional para evidências **múltiplas, consultáveis,
  com status de revisão e histórico** — os dois convivem, sem um substituir o outro.

### Estrutura genuinamente nova

- **`FiscalDocument.tripOccurrenceId`** (opcional, `SetNull` ao remover a ocorrência) + índice
  `(tenantId, tripOccurrenceId)` — mesmo padrão de `tripDeliveryStopId` (Fase 100).
- **`FiscalDocumentType.OCCURRENCE_EVIDENCE`** — novo valor aditivo no catálogo existente (mesmo padrão de
  `DELIVERY_PROOF`, Fase 56), distinto de `DELIVERY_PROOF` (evidência de **entrega**, não de ocorrência).
- **`POST /driver/trips/:id/occurrences/:occurrenceId/evidence`** — novo endpoint do Driver App, mesmo
  padrão de `/delivery-proof`.

## 2. Vínculo com `TripOccurrence` — nenhuma exigência de status

Ao contrário do POD (Fase 100, que exige a parada `COMPLETED`), **nenhuma exigência de status da ocorrência**
foi aplicada aqui — mesma decisão já tomada na Fase 101 para vincular a própria ocorrência a uma parada: uma
evidência documental (foto da avaria, boletim de ocorrência, laudo) pode legitimamente ser anexada antes,
durante ou depois da resolução da ocorrência. Quando `tripOccurrenceId` é informado, a ocorrência precisa
existir neste tenant e pertencer à mesma viagem do documento (`tripId`, quando também informado) — `404` se
a ocorrência nunca existiu, `400` se existe mas é de **outra** viagem (mesma distinção já usada para
`tripDeliveryStopId`). A validação está centralizada em
`FiscalDocumentsService.assertTripOccurrenceBelongsToTrip`, chamada pelos dois pontos de escrita (`upload`
administrativo e `submitOccurrenceEvidenceFromDriverApp`) — nunca duplicada.

## 3. Múltiplas evidências

Cada upload cria uma nova linha de `FiscalDocument` (mesmo padrão já existente desde a Fase 52/56) — duas
fotos diferentes da mesma ocorrência = duas linhas de `FiscalDocument`, ambas com o mesmo `tripOccurrenceId`.
Múltiplas evidências por ocorrência funcionam automaticamente, sem nenhum mecanismo adicional.

## 4. Preservação de histórico

`DELETE /fiscal/documents/:id` já bloqueava (409) a remoção de `DELIVERY_PROOF` (Fase 100, "POD deve
preservar histórico"). Esta fase estende a **mesma regra** para `OCCURRENCE_EVIDENCE` — pelo mesmo motivo:
um documento com valor de evidência operacional nunca deve ser apagado silenciosamente. Correção de vínculo/
status continua possível via `PATCH` (ex.: desvincular uma ocorrência errada, marcar `INVALID`/`CANCELLED`
na revisão) — só a remoção definitiva do registro é bloqueada. Demais tipos de documento fiscal (NF-e/CT-e/
MDF-e/CIOT/DACTE/DAMDFE/OTHER) continuam removíveis exatamente como antes (regressão coberta por teste).

## 5. Metadados essenciais

Reaproveitados sem nenhuma coluna nova: **tipo** (`documentType=OCCURRENCE_EVIDENCE`), **origem**
(`FiscalDocumentOrigin`, derivado do papel de quem criou — `DRIVER` via app, `ADMIN` via painel — mesmo
mecanismo da Fase 56), **responsável** (`createdBy`) e **data** (`issueDate`, informada pelo dispositivo ou
o momento do recebimento no servidor, mesmo padrão de `submitDeliveryProofFromDriverApp`).

## 6. Consulta — na viagem, na ocorrência, no detalhe administrativo

- **Na ocorrência**: `GET /fiscal/documents?tripOccurrenceId=X` (novo filtro) — usado pela aba "Ocorrências"
  da viagem (nova coluna "Documentos", com contagem e um modal de consulta/upload por ocorrência).
- **Na viagem**: `GET /fiscal/documents?tripId=X` — inalterado, continua retornando todos os documentos da
  viagem (vinculados a uma ocorrência, a uma parada, aos dois, ou a nenhum).
- **No detalhe administrativo**: `GET /fiscal/documents/:id` — a aba "Documentos fiscais" da viagem
  (Fase 52+) e o drawer de detalhe agora mostram a ocorrência vinculada (tipo + severidade), quando houver.

## 7. Driver App

Novo endpoint `POST /driver/trips/:id/occurrences/:occurrenceId/evidence` (multipart, mesmo padrão de
`/delivery-proof`): idempotente por `deviceEventId`, `vehicleId` sempre derivado da viagem (nunca aceito do
cliente), `driverId` é o motorista autenticado. `occurrenceId` precisa pertencer à viagem do motorista
autenticado (validado no servidor, mesmo princípio de defesa em profundidade já usado no fluxo
administrativo). Os tipos/cliente HTTP do app (`driverTrips.types.ts`/`driverTrips.api.ts`) foram
atualizados para refletir o novo recurso — nenhuma tela nova foi construída (o fluxo completo de captura na
UI do app, conforme já documentado como limitação da Fase 100/101 para casos análogos, fica para fase
futura).

## 8. APIs alteradas/criadas (`apps/api/src/fiscal`, `apps/api/src/driver-trips`)

| Método | Rota | O que mudou |
|---|---|---|
| `POST` | `/fiscal/documents/upload` | Aceita `tripOccurrenceId` opcional |
| `PATCH` | `/fiscal/documents/:id` | Aceita `tripOccurrenceId` opcional (envie `null` para desvincular) |
| `DELETE` | `/fiscal/documents/:id` | Bloqueia (409) também quando `documentType=OCCURRENCE_EVIDENCE` |
| `GET` | `/fiscal/documents` | Novo filtro `tripOccurrenceId` |
| `POST` | `/driver/trips/:id/occurrences/:occurrenceId/evidence` | **Nova** — evidência de ocorrência pelo Driver App |

Nenhuma rota administrativa nova — todas as mudanças no lado admin são extensões das rotas já existentes
desde a Fase 52.

## 9. Frontend (`apps/admin-web`)

- **`UploadFiscalDocumentModal`**: novo parâmetro opcional `tripOccurrenceId` (pré-vinculado quando aberto a
  partir do detalhe de uma ocorrência), mesmo padrão já usado para `tripDeliveryStopId` na Fase 100.
- **`FiscalDocumentDetailDrawer`**: mostra a ocorrência vinculada (tipo + severidade) quando houver; bloqueio
  de remoção estendido para `OCCURRENCE_EVIDENCE`, mesma mensagem/UI já usada para `DELIVERY_PROOF`.
- **`OccurrencesTab`** (aba "Ocorrências" da viagem, Fase 101): nova coluna "Documentos" — contagem por
  ocorrência (buscada uma única vez para a aba inteira e agrupada em memória, nunca uma consulta por linha),
  com um novo modal (`OccurrenceDocumentsModal`, mesmo padrão de `DeliveryStopProofsModal`/
  `DeliveryStopOccurrencesModal`) para consultar/enviar documentos daquela ocorrência especificamente.
- **`FISCAL_DOCUMENT_TYPE_LABELS`**: novo rótulo `OCCURRENCE_EVIDENCE` → "Evidência de ocorrência".

## 10. Performance / N+1

- Todas as consultas de `FiscalDocument` continuam usando o mesmo `FISCAL_DOCUMENT_INCLUDE` único e
  centralizado (Fase 52+), agora com mais um `select` leve (`tripOccurrence: { select: { type: true,
  severity: true } } }`) — um `JOIN` dentro da mesma query, nunca uma consulta adicional por documento.
- A nova coluna "Documentos" na aba de ocorrências busca os documentos da viagem **uma única vez**
  (`GET /fiscal/documents?tripId=X`) e agrupa por ocorrência em memória no frontend — nunca uma requisição
  por ocorrência.
- Testado: contagem de queries de `GET /fiscal/documents?tripId=X` fixa entre 5 e 20 ocorrências com
  evidência vinculada.

## 11. Limitações reais

- **Sem tela dedicada no Driver App** — só a API (upload/idempotência/validação) foi preparada, como pedido
  explicitamente ("integrar quando necessário"); nenhuma tela de captura de evidência de ocorrência foi
  construída nesta fase, mesmo critério já aplicado ao POD nas Fases 56/100.
- **`TripOccurrence.attachmentId` (Fase 67) não foi migrado/depreciado** — decisão deliberada: é um vínculo
  simples e único que continua funcionando para o fluxo já existente de criação de ocorrência; o novo
  mecanismo (`FiscalDocument.tripOccurrenceId`) é uma camada adicional para evidências múltiplas e
  consultáveis, não uma substituição.
- **`Document`/`DocumentOwnerType`** (compliance de veículo/reboque/motorista/tenant) permanece
  intencionalmente fora do escopo — auditado e confirmado como um modelo sem relação com viagem/entrega/
  ocorrência.
- **A escala de revisão (`FiscalDocumentStatus`) não distingue evidência "confirmada" de "não avaliada"**
  além do que já existe para todos os documentos fiscais (`PENDING`/`VALID`/`INVALID`/`CANCELLED`) — nenhuma
  máquina de estados nova foi criada especificamente para evidências.

## 12. Testes

`apps/api/test/fiscal-documents.e2e-spec.ts`, bloco "Fase 102" (15 testes novos, requests reais contra o
Postgres): upload vinculado a uma ocorrência ainda `OPEN`; ausência de exigência de status (funciona também
após resolvida); rejeição (400) de ocorrência de outra viagem; rejeição (404) de ocorrência inexistente;
múltiplos documentos para a mesma ocorrência e "consulta na ocorrência" (`tripOccurrenceId`) vs. "na viagem"
(`tripId`); vincular/desvincular via `PATCH`; preservação de histórico (`DELETE` sempre bloqueado para
`OCCURRENCE_EVIDENCE`, outros tipos continuam removíveis); submissão pelo Driver App (idempotente por
`deviceEventId`, rejeição 400 para ocorrência de outra viagem); auditoria (upload administrativo e submissão
pelo Driver App); isolamento multi-tenant; RBAC (`AUDITOR` consulta mas não escreve/remove); regressão
explícita confirmando que o POD (Fase 100) continua funcionando sem nenhuma alteração de comportamento. Mais
um teste de ausência de N+1 dedicado no mesmo arquivo.

Regressão executada: suíte completa de `fiscal-documents.e2e-spec.ts`, `trip-occurrences-shifts-timeline.
e2e-spec.ts` (ocorrências), `trip-delivery-stops.e2e-spec.ts` (entregas) e `trips.e2e-spec.ts` — todos
passando sem alteração de comportamento pré-existente.
