# Módulo de Checklist Operacional da Frota (Fases 38-39)

Este documento descreve o subsistema completo de checklist operacional:
**Fase 38** criou a fundação (domínio, banco, backend, API administrativa e
API do motorista) e **Fase 39** transformou essa fundação em uma
funcionalidade real e utilizável pelo motorista no Driver App — formulário
dinâmico, captura de foto, assinatura desenhada, offline-first via
`syncQueue`, e conclusão com revisão.

## 1. Arquitetura

```
ChecklistTemplate
      ↓
ChecklistSection
      ↓
ChecklistItem
      ↓
ChecklistExecution
      ↓
ChecklistAnswer
      ↓
ChecklistEvidence
```

- **Template**: modelo reutilizável de checklist (ex: "Sider Pré-Viagem").
  Versionado — ver seção 3.
- **Section**: agrupamento de itens dentro de um template (ex: SEGURANÇA,
  PNEUS, FREIOS), com `order` explícito.
- **Item**: pergunta/campo dentro de uma section. Tipo extensível
  (`ChecklistItemType`), mas **só `BOOLEAN` tem regra de negócio completa**
  (validação de não-conformidade crítica) — `TEXT`/`NUMBER`/`SELECT` têm
  suporte real porém básico (campo de texto/numérico simples, sem formato
  de "opções" definido para `SELECT`); `PHOTO`/`SIGNATURE` disparam captura
  de evidência real (Fase 39) — ver seção 6.
- **Execution**: uma execução real de um template, feita por um motorista.
  Fixa a versão exata do template usada (`templateId` aponta para a linha
  imutável daquela versão; `templateVersion` é uma cópia denormalizada do
  número, só para leitura sem join).
- **Answer**: resposta de um item dentro de uma execução. Única por
  `(executionId, itemId)` — nunca duplicada (constraint no banco).
- **Evidence**: foto/assinatura associada a uma execução (Fase 39: upload
  real). Reusa o mecanismo de storage `Attachment` já existente — nunca um
  storage novo.

Nenhuma tabela, serviço, matching, storage ou fila offline paralelos foram
criados em nenhuma das duas fases: `PrismaService`, `AuditService`,
`TenantContext`, `Attachment`, o padrão de idempotência por `deviceEventId`
e a `syncQueue` do driver-app são todos reaproveitados integralmente.

## 2. Tipos e status

```
ChecklistType: PRE_TRIP | POST_TRIP | MAINTENANCE | TRAILER | SAFETY | ACCIDENT | AUDIT
ChecklistTemplateStatus: DRAFT | PUBLISHED | ARCHIVED
ChecklistItemType: BOOLEAN | TEXT | NUMBER | PHOTO | SIGNATURE | ODOMETER | SELECT
ChecklistExecutionStatus: DRAFT | IN_PROGRESS | COMPLETED | FAILED | CANCELLED
ChecklistEvidenceType: ODOMETER | AXLE_1 | AXLE_2 | AXLE_3 | GENERAL | DAMAGE | SIGNATURE
```

Somente `PRE_TRIP`/`POST_TRIP` têm uso real (o Driver App só oferece esses
dois fluxos, seção 5) — os demais tipos existem para não travar a expansão
futura (nenhuma tela/regra específica de `MAINTENANCE`/`SAFETY`/`ACCIDENT`/
`AUDIT` foi implementada).

## 3. Versionamento e imutabilidade

- Um template nasce `DRAFT` — pode ser criado/editado livremente
  (`POST`/`PATCH /checklists/templates`, que substitui a árvore
  sections/items inteira a cada `PATCH`, sempre dentro de uma
  `$transaction`).
- `POST /checklists/templates/:id/publish` torna o template `PUBLISHED` —
  a partir daí, **imutável**: `PATCH` retorna `409 Conflict`.
- Para alterar um template `PUBLISHED`, `POST /checklists/templates/:id/versions`
  cria uma **nova linha** de `ChecklistTemplate` (`version + 1`, `status:
  DRAFT`, `previousVersionId` apontando para o template origem), copiando
  as sections/items do original. O template origem permanece `PUBLISHED` e
  intacto — nenhuma execução histórica muda de versão retroativamente.
- O Driver App **só trabalha com templates `PUBLISHED`**
  (`GET driver/checklists/available`) — o motorista nunca vê/edita `DRAFT`.

## 4. Execução: idempotência e imutabilidade

- `POST /driver/checklists` exige `deviceEventId`. Reenviar a mesma
  requisição devolve a execução já criada, nunca cria uma segunda
  (`@@unique([tenantId, deviceEventId])`). **Fase 39**: esta chamada é
  sempre feita ONLINE pelo Driver App (nunca entra na `syncQueue`) — ver
  seção 9.
- `POST /driver/checklists/:id/answers` é um **lote**: cada resposta é um
  `upsert` na constraint `(executionId, itemId)` — cobre "nunca duas
  respostas para o mesmo item" e "reenvio idempotente" com um único
  mecanismo.
- `POST /driver/checklists/:id/complete` valida que todo item `required`
  tem resposta E todo item `requiresPhoto` tem evidência vinculada (Fase
  39, seção 6) — `409` se faltar algum. Reenviar numa execução já
  `COMPLETED` devolve o estado atual sem revalidar (idempotente).
- Após `COMPLETED`, `submitAnswers` e `addEvidence` rejeitam qualquer
  mutação nova (`409`) — o histórico da execução é imutável.

## 5. Não-conformidade crítica (nunca bloqueia a CONCLUSÃO do checklist)

Um item pode ser marcado `critical: true`. Se um item `critical` +
`required` for respondido `NÃO`, a execução ainda completa normalmente — a
informação só é **preservada e exposta**:
`ChecklistExecutionEntity.hasCriticalNonConformity` é **calculado em tempo
de leitura** (função pura, sem Prisma) a partir das respostas — nunca
armazenado como coluna. O Driver App mostra um aviso ("ATENÇÃO: existem
itens marcados como NÃO") no resumo, mas nunca impede a conclusão do
checklist em si.

**Fase 111 -- a informação passou a ser ACIONADA em 3 pontos** (a conclusão
do checklist continua sempre permitida; o que mudou é o que acontece
DEPOIS):

1. **Início de viagem** -- opt-in por tenant, ver `docs/trip-management.md`
   seção 2 (`assertPreTripChecklistSatisfied`).
2. **Notificações** -- `NotificationType.CHECKLIST_CRITICAL_NON_CONFORMITY`
   (novo), coletor `collectChecklistCriticalNonConformity`, ver
   `docs/notifications.md` seção 14.
3. **Manutenção/OS** -- `VehicleMaintenance.checklistExecutionId` (novo,
   opcional), ação manual "Abrir OS a partir desta não conformidade" no
   admin-web (`/checklists/:id`), ver seção 13 abaixo.

Todos os 3 reaproveitam a MESMA `hasCriticalNonConformity` já existente
desde a Fase 38 -- nenhuma segunda regra de criticidade em nenhum dos 3
pontos.

**Fase 112 -- 4º ponto de leitura (não de ação)**: `GET /trips/:id/summary`
passou a expor `preTripChecklistStatus`/`preTripChecklistHasCriticalNonConformity`
no resumo de prontidão do planejamento da viagem (mesma
`hasCriticalNonConformity`, mesma `resolveRequirePreTripChecklist` da
Fase 111) -- puramente informativo, sem gatilho novo. Ver
`docs/trip-management.md` seção 18.

## 6. Evidência (foto/assinatura) — upload real (Fase 39)

### Backend

`ChecklistEvidence` ganhou dois campos novos na Fase 39 (migrations
aditivas, sem apagar dado — a tabela estava vazia até então):

- `deviceEventId` (obrigatório, `@@unique([executionId, deviceEventId])`):
  idempotência de upload, mesmo padrão do resto do sistema.
- `itemId` (opcional, indexado): **associação primária** com o item do
  template. Deliberadamente **independente** de `answerId` (que só existe
  depois que uma resposta foi confirmada pelo servidor) — a foto de um
  item `PHOTO` precisa poder ser capturada e enfileirada offline **sem**
  depender de uma resposta já sincronizada. `answerId` continua existindo
  para quando a evidência complementa uma resposta já conhecida.

`POST driver/checklists/:id/evidence` (multipart, `multer` disco privado —
mesmo padrão de `toll-import-storage.config.ts`, nunca servido
estaticamente): cria um `Attachment` (`entityName: 'ChecklistExecution'`)
e o `ChecklistEvidence` correspondente na mesma transação. Idempotente por
`(executionId, deviceEventId)`. Config: `CHECKLIST_EVIDENCE_STORAGE_DIR`
(default `./storage/checklist-evidence`), `CHECKLIST_EVIDENCE_MAX_FILE_SIZE_MB`
(default 8MB), extensões aceitas `.jpg/.jpeg/.png`.

`complete()` agora também valida (`409` se faltar): todo item
`requiresPhoto: true` precisa ter pelo menos uma `ChecklistEvidence` com
`itemId` correspondente — backend é autoridade, o Driver App só oferece UX
(desabilita o botão "Concluir" localmente, mas a validação real está aqui).

**Não implementado nesta fase**: endpoint de *download*/visualização da
evidência a partir do servidor. "Visualizar a foto" (seção 14 do pedido) é
satisfeito inteiramente do lado do cliente — a foto acabou de ser
capturada e o app já tem o arquivo local; não há necessidade de round-trip
ao servidor para isso. Se o app for reaberto e a evidência já foi
sincronizada, o Driver App mostra "🟢 Foto já enviada anteriormente" (sem
miniatura, já que não há como buscá-la de volta) em vez de tentar
renderizar uma imagem quebrada.

### Driver App — captura

- **Foto**: `expo-image-picker` (`launchCameraAsync`, câmera nativa do
  sistema — preview/aceitar/refazer já vêm prontos do SO, muito menos
  código que uma câmera customizada com `expo-camera`). `quality: 0.5`
  comprime antes mesmo de sair do dispositivo (sem lib extra de resize).
- **Assinatura**: `react-native-signature-canvas` (+ `react-native-webview`
  como peer dependency) — área de assinatura desenhada de verdade, nunca
  texto digitado como substituto. Sai como PNG base64, gravado em arquivo
  local pelo mesmo mecanismo de persistência das fotos.
- **Persistência local**: `apps/driver-app/src/storage/evidenceFiles.ts` —
  toda evidência é copiada/gravada em `FileSystem.documentDirectory`
  (persistente) imediatamente após a captura, nunca deixada na URI
  temporária da câmera/canvas (que pode desaparecer do cache do SO antes
  do flush da fila acontecer).
- **Categorização**: o template não carrega metadado suficiente para
  distinguir "foto do eixo 1" de "foto do eixo 2" sem inferir por nome do
  item (o que seria o hardcode que a Fase 39 proíbe) — por isso todo item
  `PHOTO` usa `ChecklistEvidenceType.GENERAL`; o item `SIGNATURE` sempre
  usa `SIGNATURE`. Documentado como simplificação deliberada, não um bug.

## 7. RBAC e isolamento multi-tenant

- Endpoints administrativos: `CHECKLISTS_READ_ROLES`/`CHECKLISTS_WRITE_ROLES`
  — mesma política de `FLEET_READ_ROLES`/`FLEET_WRITE_ROLES`. `DRIVER`
  nunca aparece nessas listas.
- Endpoints do motorista (`/driver/checklists/*`, incluindo `/evidence`):
  vivem no `DriverTripsController` já existente (mesmo padrão de
  `FuelSuppliesService` — nenhum controller/guard duplicado), protegidos
  pelo `DriverGuard` global.
- Toda query filtra `tenantId` explicitamente; recurso de outro tenant
  retorna `404`. Execução só é visível/editável pelo motorista dono.
- Templates são tenant-scoped por padrão — nenhum catálogo global.
- Nenhuma API key/segredo foi colocado no Driver App.

## 8. API completa

| Método | Rota | Quem | Observação |
|---|---|---|---|
| GET | `/checklists/templates` | admin (leitura) | paginado, filtro tipo/status |
| GET | `/checklists/templates/:id` | admin (leitura) | com sections+items |
| POST | `/checklists/templates` | admin (escrita) | cria DRAFT, sections+items aninhados |
| PATCH | `/checklists/templates/:id` | admin (escrita) | só DRAFT — 409 se PUBLISHED |
| POST | `/checklists/templates/:id/publish` | admin (escrita) | DRAFT→PUBLISHED |
| POST | `/checklists/templates/:id/versions` | admin (escrita) | nova versão DRAFT a partir de um PUBLISHED |
| GET | `/checklists/executions` | admin (leitura) | paginado, filtro trip/vehicle/status |
| GET | `/checklists/executions/:id` | admin (leitura) | com respostas+evidências; **Fase 111**: também `maintenances` (OS abertas a partir deste checklist) |
| GET | `driver/checklists/available` | motorista | só templates PUBLISHED do tenant; **Fase 111**: `?tripId=` opcional filtra por `vehicleType`/`trailerType` da composição daquela viagem |
| POST | `driver/checklists` | motorista | inicia execução, `deviceEventId` obrigatório, sempre ONLINE |
| GET | `driver/checklists/:id` | motorista | só a própria execução |
| POST | `driver/checklists/:id/answers` | motorista | lote, upsert por item |
| POST | `driver/checklists/:id/evidence` | motorista | **Fase 39** — multipart, idempotente por deviceEventId |
| POST | `driver/checklists/:id/complete` | motorista | idempotente, valida required + requiresPhoto |

**Fase 111** — `ChecklistExecutionEntity`/`ChecklistAnswerEntity` ganharam
campos denormalizados (`templateName`/`templateType`/`vehiclePlate`/
`driverName`/`tripDestinationName` na execução; `itemCode`/`itemLabel`/
`itemType`/`itemRequired`/`itemCritical` na resposta) — **nenhuma query
nova**, os relacionamentos já estavam incluídos na mesma consulta
(`EXECUTION_INCLUDE`), só não eram mapeados na entidade. Fecha o gap real
de o admin-web não ter como exibir uma execução legível sem N+1 de lookups
no cliente.

## 9. Driver App — fluxo pré/pós-viagem

Entrada a partir da `HomeScreen` (`apps/driver-app/src/screens/HomeScreen.tsx`):
botão "Checklist pré-viagem" no card de viagem despachada (antes de
`INICIAR VIAGEM`) e "Checklist pós-viagem" no card em andamento/pausada.

**Até a Fase 110**: nenhum dos dois bloqueava `START`/`PAUSE`/`RESUME`/
`COMPLETE` de `Trip`. **Fase 111**: `START` passou a poder ser bloqueado
pelo backend (`409`, mesma resposta tratada pela tela já existente de
início de viagem) quando o tenant ativa
`requirePreTripChecklist` — ver `docs/trip-management.md` seção 2. Opt-in,
default desligado: o fluxo do Driver App em si **não mudou nenhuma tela**
-- o motorista continua preenchendo o checklist do mesmo jeito; a única
diferença é que, com a regra ativada, `INICIAR VIAGEM` pode devolver erro
se o checklist pré-viagem não tiver sido concluído (ou tiver não-
conformidade crítica) antes. `GET driver/checklists/available` também
passou a filtrar por `vehicleType`/`trailerType` quando chamado com
`?tripId=` (`ChecklistScreen` já tinha o `tripId` disponível via
parâmetro de navegação -- nenhuma tela nova, só o parâmetro repassado).

```
HomeScreen
  → ChecklistScreen (lista templates PUBLISHED do tipo, cria ou retoma)
    → ChecklistExecutionScreen (formulário dinâmico + resumo + conclusão)
```

- **Sem tela de revisão separada**: todas as telas existentes do app são
  formulários de página única — o resumo (itens respondidos, não-
  conformidades, evidências) e o botão "CONCLUIR CHECKLIST" ficam no
  rodapé da própria tela de execução, atualizando ao vivo. Decisão
  deliberada (não um corte de escopo): menos navegação, menos toques.
- **Criação sempre online**: `ChecklistScreen` chama `Location.getCurrentPositionAsync()`
  uma única vez (nunca um segundo watcher contínuo — reusa `expo-location`
  já instalado) e `POST driver/checklists` diretamente (não via
  `syncQueue`) — precisa do `id` gerado pelo servidor antes de abrir o
  formulário, já que `answers`/`evidence`/`complete` usam esse id na URL.
  Se falhar (sem conexão), mostra erro claro e não navega — este é o único
  passo do fluxo que exige internet.
- **Formulário 100% dinâmico**: `ChecklistItemField`
  (`apps/driver-app/src/components/checklist/`) renderiza cada item pelo
  seu `type` — nenhum item do checklist real (Sider, 32 itens) está
  hardcoded em lógica; a estrutura vem inteira do `ChecklistTemplate`
  retornado por `GET driver/checklists/available` (não existe um segundo
  `GET` por template — o objeto completo é passado via parâmetro de
  navegação).
- **Recuperação após fechar o app**: `apps/driver-app/src/storage/checklistPointer.ts`
  guarda um ponteiro leve (`{tripId, type, executionId, templateId}`) —
  nunca respostas/estado do formulário. Ao reabrir, a tela busca o estado
  real via `GET driver/checklists/:id` (fonte de verdade é sempre o
  servidor).

## 10. Offline e sincronização (Fase 39)

`syncQueue.ts` (`apps/driver-app/src/storage/syncQueue.ts`) foi
**estendido**, nunca recriado: 3 novas variantes de `PendingAction`.

- `checklist-answers` e `checklist-complete`: mesmo padrão de
  `pause`/`resume`/`complete` de Trip.
- `checklist-evidence`: carrega o **path local persistido** (nunca a URI
  efêmera da câmera), `deviceEventId`, `itemId`, tipo e metadados —
  despachado via `apiUpload` (nova função em `api/http.ts`, FormData, sem
  forçar `Content-Type`).
- **`checklist-create` nunca entra na fila** (ver seção 9) — é a única
  exceção deliberada ao padrão "toda ação passa por `submitOrQueue`".

Respostas de texto/número são salvas com debounce local (~1,2s após parar
de digitar, para não gerar uma chamada de rede por tecla) e sempre
descarregadas de forma síncrona ao sair da tela ou ao concluir o
checklist — nunca perdidas. Respostas `BOOLEAN` e evidências são enviadas
imediatamente ao toque.

Indicação de sincronização na UI: texto explícito (não só cor) — "🟢
Sincronizado" / "🟡 Aguardando sincronização" por foto/assinatura, e um
aviso textual geral ("Sem conexão agora — será sincronizado
automaticamente") quando qualquer ação cai na fila.

## 11. Limitações reais e decisões documentadas

- Sem endpoint de *download* de evidência (seção 6) — visualização é só
  local, imediatamente após a captura.
- `PHOTO`/`SIGNATURE` sempre categorizados como `GENERAL`/`SIGNATURE`
  (nunca `AXLE_1`/`AXLE_2`/`AXLE_3`/`ODOMETER`) — o template não carrega
  metadado para essa distinção sem inferir por nome do item.
- `vehicleId`/`trailerId` de `ChecklistExecution` **nunca** são
  preenchidos automaticamente pelo Driver App — `DriverActiveTrip`/
  `DriverTrip` não expõem esses ids ao app hoje, e alterar isso seria
  escopo de `trips`/`fleet`, fora desta fase. Placa do cavalo/carreta são
  capturadas como **itens do template** (`TEXT`), exatamente como o
  formulário real (Sider, itens 2-3).
- KM atual **nunca** é auto-preenchido no campo estrutural
  `ChecklistExecution.odometerKm` a partir de um item do template — seria
  o hardcode "item código X = odômetro" que a fase proíbe. O campo
  estrutural fica `null`; o KM é só mais um item (`NUMBER`) respondido
  normalmente.
- `TEXT`/`NUMBER`/`SELECT` têm suporte básico real (campo de texto/numérico
  simples) — sem UI de seleção estruturada para `SELECT` (o contrato ainda
  não define um formato de "opções").
- ~~Sem bloqueio automático de `START`/`COMPLETE` de viagem por checklist
  pendente~~ -- **`START` fechado na Fase 111** (opt-in por tenant, ver
  `docs/trip-management.md` seção 2). `COMPLETE` de `Trip` continua sem
  nenhum bloqueio por checklist -- não há requisito de negócio para isso
  (a viagem pode legitimamente terminar mesmo com um checklist pós-viagem
  ainda pendente de preenchimento; travar a conclusão da viagem por isso
  seria inventar uma regra sem pedido explícito).
- ~~Sem dashboard/relatório de checklist no admin-web~~ -- **fechado na
  Fase 111**: `/checklists` (listagem) e `/checklists/:id` (detalhe com
  respostas/evidências/OS vinculada), ver seção 13.
- Sem OCR de odômetro, sem IA de análise de fotos, sem reconhecimento de
  placa — a foto é só evidência armazenada, o valor declarado pelo
  motorista continua sendo a fonte.
- **Fase 111** -- autoria de template (criar/editar/publicar/versionar)
  continua **sem nenhuma tela no admin-web** (só os contratos de API, ver
  seção 8) -- decisão deliberada: um construtor de formulário dinâmico
  (sections/items/tipos/opções) é uma frente de conteúdo separada do
  "consolidar o checklist operacional pré/pós-viagem" pedido nesta fase,
  que é sobre a operação (execução, resultado, integração), não sobre
  autoria. Templates continuam criados via API diretamente.

## 12. Testes

- **Unit (API)**: `checklists/utils/checklist-non-conformity.util.spec.ts`
  (7 casos, função pura).
- **E2E (API)**: `apps/api/test/checklists.e2e-spec.ts` (27 casos) contra
  Postgres real — templates, execução, idempotência, imutabilidade,
  RBAC, isolamento multi-tenant, associação com Trip, e upload de
  evidência (sucesso, idempotência, 409 pós-completed, validação de
  itemId/answerId, isolamento de tenant, `requiresPhoto` bloqueando
  conclusão).
- **Driver App**: `syncQueue.test.ts` (19 casos, incluindo os 8 novos
  kinds de checklist), `evidenceFiles.test.ts` (4 casos), `ChecklistScreen.test.tsx`
  (7 casos), `ChecklistExecutionScreen.test.tsx` (10 casos) — renderização
  dinâmica, validação de item obrigatório/foto obrigatória, captura e
  remoção de evidência (mocadas no limite do componente — nunca chamando
  câmera/WebView real em teste), resumo com não-conformidade, conclusão,
  modo somente-leitura após `COMPLETED`, e abertura offline (sem GET
  bem-sucedido no mount).

## 13. Fase 111 — Checklist Operacional da Frota (consolidação)

Auditoria prévia confirmou que o módulo (Fase 38/39) já era muito maduro:
template versionado, execução idempotente/imutável, evidência real,
offline-first completo. Os gaps reais fechados nesta fase, todos já
listados na seção 11 (limitações conhecidas desde a Fase 39) mais 3 gaps
adicionais encontrados por auditoria de código (não documentados antes
porque nunca haviam sido verificados linha a linha até esta fase):

1. **`ChecklistTemplate.vehicleType`/`trailerType` nunca filtravam nada**
   (existiam desde a Fase 38, só armazenados) — `findPublishedForDriver`
   agora aceita `tripId` opcional e filtra pelo tipo do veículo/carretas da
   composição daquela viagem (seção 8/9).
2. **Bloqueio de início de viagem** (opt-in por tenant), ver
   `docs/trip-management.md` seção 2.
3. **Integração com manutenção/OS**: `VehicleMaintenance.checklistExecutionId`
   (novo, opcional, migration aditiva — coluna nullable + índice + FK
   `ON DELETE SET NULL`, `20260910000000_vehicle_maintenance_checklist_link`)
   — mesma decisão de modelagem já usada por `TireMovement.maintenanceId`
   (Fase 109): vínculo manual, nunca uma OS criada automaticamente. Ação
   "Abrir OS a partir desta não conformidade" em `/checklists/:id`
   (admin-web), habilitada só quando `hasCriticalNonConformity=true` e o
   checklist tem `vehicleId`; pré-preenche veículo/descrição/prioridade no
   mesmo `CreateMaintenanceModal` já existente (Fase 13, estendido com
   `checklistExecutionId`/`priority`, nunca um modal novo).
   `ChecklistExecutionEntity.maintenances` (novo, só em `findOne`, mesmo
   princípio de N+1 de `MaintenanceEntity.tireMovements`, Fase 109) lista
   as OS já abertas a partir daquele checklist.
4. **Notificações**: `NotificationType.CHECKLIST_CRITICAL_NON_CONFORMITY`
   (novo, enum aditivo), ver `docs/notifications.md` seção 14.
5. **Torre de Controle**: `TripOperationEntity.preTripChecklistStatus`/
   `preTripChecklistHasCriticalNonConformity`, ver `docs/control-tower.md`.
6. **Admin-web**: `/checklists` (listagem paginada, filtro veículo/status)
   e `/checklists/:id` (detalhe: identificação, respostas com item
   crítico destacado, evidências, OS vinculadas, ação "Abrir OS"). Linhas
   de checklist na aba "Operação" da viagem (`/trips/:id`, Fase 66) e na
   nova aba "Checklists" de `/vehicles/:id` agora navegam para o detalhe
   (antes, sem nenhuma tela de destino). Item de menu "Checklists" novo no
   grupo "Frota" (`nav-config.ts`, `TenantModule.CHECKLIST` — enum já
   existia, nunca usado por nenhum item de menu até agora).

**Nenhuma migration para o enum `NotificationType`**: durante a auditoria
desta fase foi encontrado que o valor `CHECKLIST_CRITICAL_NON_CONFORMITY`
já existia no banco (`ALTER TYPE` não é reversível em Postgres sem recriar
o tipo) — resíduo do incidente de um agente em background que executou
trabalho não solicitado numa fase anterior e foi revertido a nível de
código/migrations, mas não pôde reverter o `ADD VALUE` já aplicado ao
enum. Como o nome coincide exatamente com o que esta fase precisava, o
valor foi conscientemente reaproveitado (documentado aqui por
transparência) em vez de recriar o tipo só para "limpar" um valor inerte
que nunca tinha sido referenciado por nenhum código até esta fase.

**Bug real corrigido nesta fase (não introduzido por ela)**: o array de
nomes desestruturados do `Promise.all` em
`NotificationsService.collectCandidates` estava desalinhado com a lista de
coletores desde a Fase 110 (2 coletores adicionados sem os 2 nomes
correspondentes) — as notificações dos 2 últimos coletores da lista
(`collectDeliveryProofProblem`/`collectContractsExpiring`) eram
silenciosamente descartadas. Corrigido junto com a adição do coletor desta
fase; ver `docs/notifications.md` seção 15 para o detalhe completo e o
teste novo de `CONTRACT_EXPIRING` que fecha a lacuna de cobertura que
deixou o bug passar despercebido. Um segundo bug pré-existente e não
relacionado também foi encontrado e corrigido na mesma auditoria (mock
desatualizado em `notifications.service.spec.ts`, quebrando os 13 testes
unitários da suite desde a Fase 108) -- mesma seção.

- **Unit (API)**: `trips/utils/trip-preferences.util.spec.ts` (5 casos,
  função pura de leitura de `TenantSettings.preferences`).
- **E2E (API)**: `checklists.e2e-spec.ts` (+2: filtro por vehicleType/
  trailerType), `trips.e2e-spec.ts` (+5: gate desligado/ligado × ausente/
  incompleto/crítico/ok), `maintenances.e2e-spec.ts` (+3: cria com
  checklistExecutionId, rejeita inexistente, regressão sem vínculo),
  `notifications.e2e-spec.ts` (+3 do checklist crítico, +2 de
  `CONTRACT_EXPIRING` fechando a lacuna de cobertura do bug acima),
  `trip-operations-monitor.e2e-spec.ts` (+4: status/criticidade do
  checklist pré-viagem na Torre de Controle) — `trip-operations-load.e2e-spec.ts`
  reconfirmado sem N+1 (11 queries fixas, antes 10).
- **Frontend**: `checklists/[id]/page.test.tsx` (novo, 4 testes),
  `checklists/page.test.tsx` (novo, 3 testes), `operations/control-tower/page.test.tsx`
  (+2: badge de checklist crítico/concluído, contagem em "Exigem
  intervenção").
- **Driver App**: `ChecklistScreen.test.tsx` (+1: `tripId` repassado a
  `getAvailableChecklists`).
