# Módulo Fiscal/Documental (Fase 52, estendida nas Fases 53, 54, 55, 56, 57, 58 e Fase Fiscal/XML)

Armazenamento, identificação básica e vinculação operacional de documentos
fiscais/documentais (CT-e, MDF-e, NF-e, CIOT, DACTE, DAMDFE, comprovante de
entrega e outros). **Sem emissão fiscal e sem integração com SEFAZ/gateway
nesta fase** — o módulo prepara a arquitetura (entidade central, tipos,
status, vínculo, parser tolerante de XML) para fases futuras de emissão e
integração externa, mas nada aqui se comunica com um sistema fiscal oficial.

Operação → Fiscal → Financeiro: este módulo é a camada intermediária —
documentos se vinculam a viagens/veículos/motoristas/clientes já existentes
(Operação) e, desde a Fase Fiscal/XML, podem alimentar Contas a Pagar/
Receber (Fases 72/73) quando o XML já trouxer um valor extraído — sempre
por ação explícita do usuário, nunca automático (ver seção 18).

## 1. Escopo atual

| Recurso | Status nesta fase |
|---|---|
| Cadastro/upload de documento (PDF/XML/JPG/JPEG/PNG) | ✅ |
| Importação de XML (NF-e/CT-e/MDF-e) com extração automática | ✅ (parser tolerante, sem validação SEFAZ) |
| Vínculo com viagem/veículo/motorista/cliente | ✅ (opcional, editável depois via PATCH) |
| Deduplicação por chave de acesso / combinação sem chave | ✅ |
| Dashboard (indicadores, gráficos, tabela, ranking, pendentes/problemáticos) | ✅ |
| Seção "Documentos fiscais" no detalhe da viagem, com status documental consolidado | ✅ (somente leitura sobre a viagem + upload/importação/vínculo de documento; nunca altera o fluxo da viagem) |
| Vincular documento **já existente** (sem duplicar) a uma viagem | ✅ (Fase 53) |
| Status documental consolidado da viagem (existentes/pendentes/inválidos/cancelados/tipos presentes/ausentes) | ✅ (Fase 53) |
| Histórico de auditoria por documento (`GET .../:id/history`) | ✅ (Fase 53, reaproveita `AuditService`) |
| Navegação Documento → Viagem (link direto no detalhe) | ✅ (Fase 53) |
| Validação estrutural (chave de acesso, tipo, campos essenciais, data, duplicidade, vínculo) | ✅ (Fase 54, ver seção 13) |
| Alertas fiscais agregados no dashboard | ✅ (Fase 54) |
| Matriz documental da viagem por tipo, situação documental (OK/atenção/problemático/indisponível) | ✅ (Fase 55, ver seção 14) |
| Divergência operacional (veículo/motorista/cliente do documento × da viagem) | ✅ (Fase 55) |
| Relacionamento MDF-e ↔ CT-e/NF-e via chaves manifestadas no XML | ✅ (Fase 55, quando o dado existe no XML) |
| Sugestão segura de documentos não vinculados (mesma evidência objetiva da viagem) | ✅ (Fase 55) |
| Comprovante de entrega pelo Driver App (offline-first, idempotente) | ✅ (Fase 56, ver seção 15) |
| Origem do documento (app do motorista × painel administrativo) | ✅ (Fase 56, derivado do `role` do criador) |
| Status derivado do comprovante de entrega (sem comprovante/pendente/disponível/com problema) | ✅ (Fase 56) |
| Preview/download do arquivo original | ❌ não existe para NENHUM tipo de documento no projeto (limitação pré-existente, ver seção 15.6) |
| Controle operacional de CIOT (cadastro manual, vínculo, matriz, dashboard) | ✅ (Fase 57, ver seção 16 — reaproveita `FiscalDocument`, nenhuma tabela nova) |
| Relacionamento MDF-e ↔ CT-e/NF-e agregado (matriz da viagem + dashboard) | ✅ (Fase 58, ver seção 17 — generaliza o cálculo por documento da Fase 55 para lotes já carregados, zero queries novas) |
| Aproveitamento financeiro: gerar conta a pagar/receber a partir do valor extraído do XML | ✅ (Fase Fiscal/XML, ver seção 18 — sempre uma ação explícita do usuário, nunca automática) |
| Emissão de CT-e/MDF-e/NF-e | ❌ fora de escopo (fase futura) |
| Integração/consulta SEFAZ, certificado digital A1/A3 | ❌ fora de escopo |
| OCR / IA | ❌ fora de escopo |
| Webhook fiscal, integração CIOT externa, DANFE/DACTE/DAMDFE gerados pelo sistema | ❌ fora de escopo |

## 2. Modelagem

`FiscalDocument` — entidade central, nova (nenhuma tabela existente
duplicada; distinta do model `Document`/`DocumentType` já existente, que
cobre documentos de **conformidade** de veículo/motorista — CRLV, CNH,
seguro — um domínio diferente, com enum próprio, nunca reaproveitado aqui
para não misturar os dois assuntos). Reaproveita integralmente:

- `Attachment` (mecanismo de storage já existente) — `FiscalDocument.
  attachmentId` aponta para o arquivo real, mesmo padrão de `TripExpense.
  attachmentId`/`ChecklistEvidence.attachmentId`.
- `Tenant`/`Trip`/`Vehicle`/`Driver`/`Customer` — vínculo via FK opcional
  direta (`tripId`/`vehicleId`/`driverId`/`customerId`), nenhuma tabela
  nova de viagem/veículo/motorista criada.
- `AuditService` — toda mutação sensível é auditada (seção 6).
- `PaginationQueryDto`/`buildPaginationMeta` — mesma paginação de toda a
  API.

Migration: `fiscal_documents` (nova tabela) + 3 enums (`FiscalDocumentType`,
`FiscalDocumentStatus`, `FiscalDocumentSource`) + colunas de relação
inversa em `Tenant`/`Trip`/`Vehicle`/`Driver`/`Customer`/`Attachment`/
`UserAccount`. Nenhuma coluna adicionada às tabelas existentes.

## 3. Tipos suportados (`FiscalDocumentType`)

`CTE`, `MDFE`, `NFE`, `CIOT`, `DACTE`, `DAMDFE`, `DELIVERY_PROOF`, `OTHER`.

O parser de importação de XML (seção 5) reconhece automaticamente apenas
**NF-e, CT-e e MDF-e** — os demais tipos (CIOT, DACTE, DAMDFE,
DELIVERY_PROOF, OTHER) só entram via upload manual, com o tipo informado
pelo usuário.

## 4. Status (`FiscalDocumentStatus`)

| Status | Significado |
|---|---|
| `PENDING` | Recém-criado (upload manual), aguardando revisão/classificação. |
| `VALID` | **Estrutura/conteúdo básico reconhecido pelo sistema** (o parser XML identificou o tipo e extraiu os campos esperados) OU marcado manualmente como válido via PATCH. |
| `INVALID` | Marcado manualmente como inválido (ex: documento ilegível, divergente). |
| `CANCELLED` | Documento cancelado (ex: nota cancelada na origem) — informação manual, não deriva de integração SEFAZ. |

**`VALID` NUNCA significa validação fiscal oficial perante a SEFAZ.** Não
há consulta ao webservice da SEFAZ nesta fase — `VALID` é estritamente "o
parser reconheceu a estrutura básica do XML (elemento `infNFe`/`infCte`/
`infMDFe` presente)". Um XML pode ter `VALID` aqui e ainda assim estar
cancelado, inidôneo ou nunca ter sido autorizado pela SEFAZ — este módulo
não tem como saber disso.

A Fase 54 adiciona uma camada de **validação estrutural** independente do
`status` (um documento pode estar `VALID`/`PENDING`/`CANCELLED` e ainda
assim ter inconsistências estruturais identificadas) — ver seção 13.

## 5. Importação de XML (`POST /fiscal/documents/import`)

Parser **tolerante**, baseado em regex sobre o texto do XML (mesmo padrão
já usado por `antt-kml.parser.ts` para KML da ANTT — nenhuma dependência
XML nova adicionada ao projeto). Reconhece o tipo pelo elemento
`<infNFe>`/`<infCte>`/`<infMDFe>` (funciona tanto no XML "solto" quanto no
"processado", ex: `<nfeProc><NFe><infNFe>`), e extrai, quando presentes:

| Campo | Origem no XML | NF-e | CT-e | MDF-e |
|---|---|---|---|---|
| Chave de acesso | atributo `Id` do elemento `infNFe`/`infCte`/`infMDFe` | ✅ | ✅ | ✅ |
| Número | `<nNF>` / `<nCT>` / `<nMDF>` dentro de `<ide>` | ✅ | ✅ | ✅ |
| Série | `<serie>` dentro de `<ide>` | ✅ | ✅ | ✅ |
| Data de emissão | `<dhEmi>` (ou `<dEmi>` como fallback) | ✅ | ✅ | ✅ |
| Emitente (nome/documento) | `<emit><xNome>`/`<CNPJ>` | ✅ | ✅ | ✅ |
| Destinatário (nome/documento) | `<dest><xNome>`/`<CNPJ>` | ✅ | ✅ | ❌ (MDF-e não tem destinatário — é um manifesto de várias NF-e/CT-e; nunca inventado) |
| Valor | `<total><ICMSTot><vNF>` / `<vPrest><vTPrest>` | ✅ | ✅ | ❌ (MDF-e não tem valor de documento) |

O valor extraído vai para `FiscalDocument.metadata` (JSON), **não** é uma
coluna própria — não fazia parte da lista mínima de campos pedida para
esta fase, e nenhum indicador do dashboard depende dele.

Qualquer campo ausente no XML fica `null` — **nunca inventado ou
estimado**. XML que não contém `infNFe`/`infCte`/`infMDFe` reconhecível é
rejeitado com 400 (nenhum tipo "adivinhado").

**Nunca valida autenticidade perante a SEFAZ** — não há consulta a
nenhum webservice oficial, nem verificação de assinatura digital do XML.
A extração é puramente estrutural.

## 6. Vínculo operacional

Prioridade conforme pedido: Trip → veículo → motorista → cliente. Todos os
4 vínculos (`tripId`/`vehicleId`/`driverId`/`customerId`) são **opcionais
e independentes** — um documento pode ser importado sem nenhum vínculo e
vinculado depois via `PATCH /fiscal/documents/:id` (envie `null` para
desvincular um campo específico). Validado contra o tenant do usuário
autenticado em toda escrita (nunca aceita um id de outro tenant).

A tela de detalhe da viagem ganhou a seção "Documentos fiscais"
(`GET /fiscal/documents?tripId=...`) — **somente leitura sobre o fluxo da
viagem em si**: nenhum campo/estado do model `Trip` foi alterado, nenhum
service de viagem foi tocado.

**Fase 53** — vincular um documento **já existente** (nunca cria um novo):
a seção da viagem ganhou o botão "Vincular existente", que busca
documentos sem nenhum vínculo (`GET /fiscal/documents?unlinkedOnly=true`)
e aplica o vínculo via o mesmo `PATCH /fiscal/documents/:id` já usado para
editar status/vínculo — nenhum endpoint novo de "vínculo" foi criado. O
detalhe do documento também ganhou navegação direta para a viagem
vinculada (`/trips/:id`) quando houver `tripId`.

### Status documental da viagem (Fase 53) — `GET /fiscal/documents/trip/:tripId/status`

Visão consolidada, calculada sob demanda (nunca persistida): total de
documentos, contagem por status (`pendingCount`/`validCount`/
`invalidCount`/`cancelledCount`) e `presentTypes`/`absentTypes` — este
último é apenas o complemento do catálogo `FiscalDocumentType` (8 tipos)
menos os tipos já presentes na viagem. **`absentTypes` é puramente
informativo** — nunca uma lista de "documentos obrigatórios para esta
viagem", regra de negócio que não existe no projeto e não foi inventada
aqui.

## 7. Duplicidade e idempotência

- **Com chave de acesso**: `@@unique([tenantId, accessKey])` no banco.
  Upload manual com uma chave já existente é **rejeitado (409)** — decisão
  deliberada, um upload manual repetido é mais provavelmente um erro do
  usuário. Reimportar o mesmo XML (mesma chave extraída) é **idempotente**
  — retorna o documento já existente, nunca cria um segundo (nem duplica o
  arquivo em disco).
- **Sem chave de acesso**: fallback usa a combinação
  `tenantId + documentType + documentNumber + series + issueDate` — só
  quando há `documentNumber` (sem número, não há base confiável de
  comparação, então **nunca deduplicado** — cada upload sem número vira um
  registro novo, evitando uma heurística frágil sobre dados insuficientes).

## 8. Upload e segurança de arquivo (§3/§10)

Reaproveita integralmente o mecanismo de storage já existente
(`Attachment`, disco privado nunca servido estaticamente) e as proteções
da Fase 46: nome em disco sempre um UUID novo (nunca o nome do cliente),
filtro de extensão pelo multer (`ALLOWED_FISCAL_DOCUMENT_EXTENSIONS` =
`.pdf/.xml/.jpg/.jpeg/.png`), **validação real de assinatura binária** do
arquivo já salvo (`assertValidFileSignature`, estendida nesta fase com os
tipos `PDF`/`XML` — mesma função usada por checklist evidence/toll import),
`UPLOAD_THROTTLE`, `sizeBytes` registrado, e remoção do arquivo físico
quando qualquer etapa falhar (assinatura inválida, vínculo inexistente,
limite de armazenamento do plano, duplicidade). Arquivo maior que o limite
configurado (`FISCAL_DOCUMENTS_MAX_FILE_SIZE_MB`) é rejeitado pelo multer
com **413 Payload Too Large** (erro de cliente bem formado, nunca 500).

Isolamento: `tenantId` nunca é aceito do cliente — sempre resolvido do JWT
(`TenantContext.requireTenantId()`). Um `SUPER_ADMIN` autenticado numa
sessão de um tenant específico só vê os documentos **daquele** tenant —
não há nenhuma rota neste módulo com acesso cross-tenant (distinto das
rotas administrativas de `/tenants`/`/super-admin`, que são endpoints
totalmente separados).

## 9. API

| Rota | RBAC | Descrição |
|---|---|---|
| `GET /fiscal/documents` | leitura | Lista paginada, filtros: `documentType`, `status`, `issueDateFrom`/`issueDateTo`, `documentNumber`, `accessKey`, `tripId`, `vehicleId`, `driverId`, `customerId`, `unlinkedOnly`. |
| `GET /fiscal/documents/dashboard` | leitura | Indicadores agregados (seção 10) — não listado literalmente no pedido original, adicionado por ser indispensável para o dashboard funcionar sem carregar todos os documentos no cliente (mesmo padrão de todo dashboard já existente no projeto). Aceita os **mesmos filtros** de `GET /fiscal/documents` (Fase 53). |
| `GET /fiscal/documents/trip/:tripId/status` | leitura | **Fase 53** — status documental consolidado da viagem (ver seção 6). |
| `GET /fiscal/documents/:id` | leitura | Detalhe. |
| `GET /fiscal/documents/:id/history` | leitura | **Fase 53** — histórico de auditoria do documento (quem, quando, IP, User-Agent, antes/depois), reaproveitando `AuditService.findByEntity` (mesmo padrão de `GET /vehicles/:id/history`). |
| `POST /fiscal/documents/upload` | escrita | Upload direto, metadados manuais. |
| `POST /fiscal/documents/import` | escrita | Importação de XML, metadados extraídos automaticamente. |
| `PATCH /fiscal/documents/:id` | escrita | Status, metadados manuais, vínculo operacional (inclui vincular um documento já existente à viagem, Fase 53). `documentType`/`accessKey`/`source`/`attachmentId` são identidade do documento — nunca editáveis por aqui. |
| `DELETE /fiscal/documents/:id` | escrita | Remove o registro. O arquivo em disco **não** é apagado (mesmo comportamento de `TripRevenue`/`TripExpense` — nenhuma entidade do sistema faz cleanup de `Attachment` ao excluir o registro que a referencia; limitação pré-existente, não introduzida aqui). |

**Fase 54** — nenhuma rota nova: as 4 rotas de leitura acima (`GET
/fiscal/documents`, `GET .../:id`, `GET .../dashboard`, `GET
.../trip/:tripId/status`) passaram a incluir também o resultado da
validação estrutural (`validationIssues` por documento, `alerts`/
`cancelledCount` no dashboard, `structurallyValidCount`/`problematicCount`/
`completenessPercent`/`completenessAvailable` no status da viagem) — ver
seção 13. As respostas de escrita (`upload`/`import`/`PATCH`) também
retornam `validationIssues` já calculado para o documento afetado.

**Fase 55** — nenhuma rota nova (novamente): `GET /fiscal/documents/:id`
passou a incluir `relatedDocuments`/`relatedDocumentsAvailable` (seção 14.3);
`GET /fiscal/documents/trip/:tripId/status` passou a incluir `matrix`,
`complianceStatus` e `unlinkedCandidates` (seção 14.1/14.2/14.4);
`GET /fiscal/documents/dashboard` passou a incluir
`tripsWithDocumentsOk/Attention/Problematic`, `operationalDivergenceCount`
e `problemsMonthlyEvolution` (seção 14.5). `relatedDocuments` **só** é
calculado no detalhe (1 documento) — nunca em listagem/dashboard, para
não introduzir N+1.

**Fase 56** — 1 rota nova, mas fora deste controller: `POST
/driver/trips/:id/delivery-proof` (`DriverTripsController`, ver seção 15.2)
— reaproveita `FiscalDocumentsService` (nenhum service paralelo), mas vive
sob `/driver` porque `FiscalDocumentsController` é role-gated para excluir
`DRIVER` (decisão da Fase 52, preservada). As 4 rotas de leitura acima
passaram a incluir também `origin` (por documento) e os indicadores de
comprovante de entrega no dashboard/status da viagem (ver seção 15.3/15.4).

**Fase 58** — nenhuma rota nova: `GET /fiscal/documents/trip/:tripId/status`
passou a incluir `relatedCount` em cada linha da `matrix` (seção 17) e
`GET /fiscal/documents/dashboard` passou a incluir `relatedDocumentsCount`
(seção 17) — ambos calculados em memória sobre lotes de documentos já
carregados por essas mesmas rotas, sem nenhuma query adicional.

RBAC: leitura = `SUPER_ADMIN/ADMIN/MANAGER/OPERATOR/DISPATCHER/AUDITOR`;
escrita = os mesmos exceto `AUDITOR` — mesmo grupo operacional já usado
por `toll-import`/`checklists`. `DRIVER` nunca acessa este controller
(acessa exclusivamente `POST /driver/trips/:id/delivery-proof`, atrás de
`DriverGuard` — Fase 56). Nenhum `@RequireModule` aplicado nesta fase
(nenhum `TenantModule` existente descreve "Fiscal"; adicionar um valor
novo ao enum não foi pedido nesta fase e não há enforcement de módulo
especificado no escopo).

## 10. Dashboard (`/operations/fleet/fiscal`)

Indicadores: total de documentos, CT-e, MDF-e, NF-e, CIOT, pendentes,
reconhecidos (válidos), inválidos, **cancelados (Fase 54)**,
vinculados/sem vínculo. Gráficos: evolução mensal (últimos 12 meses, por
`issueDate` quando presente, senão `createdAt`), distribuição por tipo
(ranking, ordenado por contagem desc), status dos documentos, e **alertas
fiscais por motivo estrutural (Fase 54, seção 13)**. Painel "documentos
pendentes/problemáticos" — **critério ampliado na Fase 54**: `PENDING`/
`INVALID` (Fase 53) **OU** 1+ inconsistência estrutural mesmo com status
`VALID`/`CANCELLED` — os 10 mais recentes no mesmo escopo de filtro, cada
item mostrando o(s) motivo(s) via `validationIssues`, clicável para abrir
o detalhe. Tabela: documento, tipo, número, chave, viagem, veículo,
status, data, origem (upload/XML), **situação estrutural (Fase 54)** —
com filtros e paginação, clique na linha abre o detalhe (drawer) com
metadados completos, situação estrutural, histórico e edição de
status/vínculo.

**Fase 53** — o dashboard aceita os **mesmos filtros** da listagem
(`documentType`/`status`/período/`tripId`/`vehicleId`/`driverId`/
`customerId`/`unlinkedOnly`) e todo indicador (`linkedCount`,
`unlinkedCount`, `byType`, `byStatus`, `problematicDocuments`,
`monthlyEvolution`) é recalculado dentro desse mesmo escopo — a
composição do filtro usa `AND` (nunca sobrescreve o filtro do usuário),
então um filtro que já exige vínculo (ex: `tripId=X`) corretamente resulta
em `unlinkedCount=0`, e um filtro de status específico restringe também
`problematicDocuments`.

Toda a agregação roda em `Promise.all` com um número fixo de queries
(`count` total + 2 `groupBy` + `count` sem vínculo + `findMany` enriquecido
para a série mensal/classificação estrutural + `groupBy` de candidatos a
duplicidade — Fase 54 — + `findMany` bounded dos problemáticos) — testado
com 10 e 50 documentos (contagem real de queries via `$extends`,
`fiscal-documents.e2e-spec.ts`), sem crescimento. `GET
/fiscal/documents/trip/:tripId/status` segue o mesmo princípio (1
`findMany` dos documentos da viagem + 1 `groupBy` de duplicidade, Fase 54
— antes eram 3 `groupBy` separados), testado com 10 e 50 documentos na
mesma viagem. `GET /fiscal/documents` (listagem paginada) ganhou 1 query
extra fixa (`groupBy` de duplicidade), independente do tamanho da página
ou do total de documentos.

## 11. Testes

- **Unitário**: parser XML (identificação de tipo, extração por tipo,
  campos ausentes nunca inventados, MDF-e sem destinatário/valor),
  normalização de chave de acesso (pontuação/espaços, tamanho inválido),
  validação de assinatura binária (PDF/XML novos, além dos já existentes
  JPEG/PNG/CSV/XLSX), mapeamento (Prisma → entity).
- **E2e** (`fiscal-documents.e2e-spec.ts`): upload (PDF/JPG/PNG, vínculo,
  assinatura inválida sem deixar `Attachment` órfão, extensão não
  suportada, vínculo com registro inexistente), importação XML (NF-e/CT-e/
  MDF-e, vínculo, extensão errada, XML não reconhecido), duplicidade/
  idempotência (com e sem chave de acesso), listagem/filtros, vínculo via
  PATCH (link/unlink + auditoria), isolamento multi-tenant, RBAC (DRIVER
  bloqueado, AUDITOR só lê, SUPER_ADMIN completo), limite de upload (app
  isolado com limite baixo), N+1 (10 vs. 50 documentos, listagem e
  dashboard). **Fase 53** (mesmo arquivo, estendido): histórico de
  auditoria por documento, status documental da viagem (fixture com
  PENDING/VALID/INVALID/CANCELLED + tipos presentes/ausentes, e viagem sem
  nenhum documento), dashboard com filtros (linkedCount/unlinkedCount
  somam o total, byType ordenado, problematicDocuments restrito por
  status/tripId), 404 em `history`/`trip/:id/status` para documento/viagem
  de outro tenant ou inexistente, RBAC das 2 rotas novas, N+1 de
  `trip/:tripId/status` (10 vs. 50 documentos na mesma viagem).
  **Fase 54** (mesmo arquivo, estendido): validador estrutural puro
  (`fiscal-document-validation.util.spec.ts` — 43 testes unitários entre
  esse arquivo e `access-key.util.spec.ts` estendido: DV mod-11 válido/
  inválido, modelo da chave vs. tipo, campos essenciais por fonte,
  data futura, XML bem-formado/malformado); e2e: documento consistente
  sem `validationIssues`, chave com DV inválido nunca bloqueia a escrita
  (só sinaliza), tipo incompatível com o modelo da chave, XML importado
  com campos essenciais ausentes (e confirmação de que upload manual
  nunca é exigido a ter esses campos), data de emissão no futuro,
  duplicidade sinalizada em ambos os documentos (com chaves diferentes,
  nunca bloqueada na escrita), vínculo inconsistente com o veículo real
  da viagem, documento com vínculo mas sem viagem vs. documento sem
  nenhum vínculo (não sinalizado), dashboard com `cancelledCount`/
  `alerts`/documento `VALID` aparecendo em `problematicDocuments` por
  inconsistência estrutural, status da viagem com
  `structurallyValidCount`/`problematicCount`/`completenessPercent`
  sempre `null`/`completenessAvailable` sempre `false`, duplicidade nunca
  cruzando tenants, XML malformado com mensagem distinta de "tipo não
  reconhecido", e regressão completa dos 28 testes pré-existentes
  (upload/importação/duplicidade/filtros/vínculo/histórico/status/
  dashboard/isolamento/RBAC/limite de upload/N+1) — todos os 35 testes do
  arquivo passando, incluindo os 2 testes de N+1 (10 vs. 50 documentos)
  que continuam com contagem de queries constante mesmo com a
  classificação estrutural adicionada.
  **Fase 55** (mesmo arquivo, estendido, 11 novos testes): situação
  documental UNAVAILABLE/OK/ATTENTION/PROBLEMATIC (sem documentos, documento
  válido, pendente, inválido, cancelado), divergência de cliente
  (INCONSISTENT_LINK + PROBLEMATIC), candidatos não vinculados (documento
  com o mesmo veículo aparece, veículo diferente nunca aparece, viagem sem
  contexto comparável nunca sugere nada), relacionamento MDF-e → CT-e/NF-e
  nos dois sentidos (chNFe/chCTe manifestados) e indisponibilidade quando
  faltam dados (MDF-e sem manifesto, NF-e/CT-e sem viagem), dashboard com
  `tripsWithDocumentsOk/Problematic`/`operationalDivergenceCount`. Unit
  novo: `trip-compliance.util.spec.ts` (situação documental, matriz,
  candidato seguro) + extensão de `fiscal-document-validation.util.spec.ts`
  (divergência de cliente) e `fiscal-xml.parser.spec.ts` (chaves
  manifestadas). **46/46 testes do arquivo e2e passando** (35 pré-existentes
  + 11 novos), nenhuma regressão.
  **Fase 56** (comprovante de entrega): `fiscal-documents.e2e-spec.ts`
  ganhou 2 testes (origin=ADMIN + `deliveryProofStatus` reagindo a
  upload/PATCH status; dashboard com `tripsWithDeliveryProof`/
  `tripsWithoutDeliveryProof`/cobertura) — **48/48 passando**.
  `driver-trips.e2e-spec.ts` ganhou 6 testes novos (registro com
  vehicleId/driverId/customerId derivados automaticamente da viagem +
  `origin=DRIVER`; idempotência por `deviceEventId` — reenvio/retry nunca
  cria um segundo documento; assinatura binária inválida rejeitada;
  isolamento tenant — motorista de outro tenant não registra numa viagem
  que não é sua, 404; RBAC — admin não acessa a rota do motorista, 403;
  histórico de auditoria reflete a submissão) — **36/36 passando**. Unit
  novo: `computeDeliveryProofStatus` (`trip-compliance.util.spec.ts`,
  MISSING/PENDING/AVAILABLE/PROBLEMATIC, incluindo o caso de regressão
  corrigido em que um comprovante recém-enviado — status `PENDING` sem
  nenhum problema — não pode cair em `PROBLEMATIC` só por `PENDING` já
  contar para `problematicCount`, Fase 54; por isso a matriz ganhou um
  campo `withIssuesCount` independente de status) e `origin` no mapper
  (`fiscal-document.mapper.spec.ts`). Driver App: `syncQueue.test.ts`
  ganhou o kind `delivery-proof` (online/com observação/offline + fila
  persistindo no `AsyncStorage` "após reinicialização" + retry com o
  mesmo `deviceEventId`); `DeliveryProofScreen.test.tsx` (novo — captura
  de foto, bloqueio sem foto, observação, aviso offline). **100/100
  testes do driver-app passando** (12 suítes).
  **Fase 57** (CIOT): `fiscal-document-validation.util.spec.ts` ganhou o
  teste de regressão do escopo de `INVALID_ACCESS_KEY` (CIOT com valor
  digitado no campo nunca é avaliado pelo algoritmo de NF-e).
  `fiscal-documents.e2e-spec.ts` ganhou 8 testes novos: cadastro manual
  (número, sem chave, já vinculado a viagem/veículo/motorista/cliente),
  valor digitado na chave nunca gera `INVALID_ACCESS_KEY`, vínculo de CIOT
  existente via `PATCH`, duplicidade (mesmo mecanismo genérico, 409),
  isolamento tenant, histórico de auditoria, matriz documental +
  `complianceStatus` refletindo o CIOT vinculado, e dashboard (vinculados/
  sem vínculo/pendentes/inválidos/problemáticos/divergência operacional)
  — **56/56 passando** (48 pré-existentes + 8 novos), incluindo os 2
  testes de N+1 sem crescimento de queries.
  **Fase 58** (relacionamento agregado MDF-e ↔ CT-e/NF-e): unit novo
  `fiscal-relationship.util.spec.ts` (8 testes —
  `extractManifestedAccessKeys` com metadata nulo/não-objeto/array/campo
  ausente/campo não-array/entradas não-string; `buildRelatedDocumentIdSet`
  com lote sem MDF-e, chave resolvida dentro do lote marcando as duas
  pontas, documento "solto" nunca marcado, chave manifestada fora do lote
  nunca marcada, MDF-e sem manifesto, 1 MDF-e manifestando vários
  documentos). `fiscal-documents.e2e-spec.ts` ganhou 2 testes: matriz da
  viagem com `relatedCount` contando o MDF-e e o CT-e/NF-e que ele
  manifesta (tipos sem relação ficam `0`) e dashboard com
  `relatedDocumentsCount` contando as duas pontas somente quando ambas
  estão no escopo do filtro atual (filtrando só por `MDFE`, o CT-e sai do
  escopo e a contagem cai para `0`, confirmando que o cálculo nunca
  "alcança" dados fora do lote carregado pela query) — **58/58 passando**
  (56 pré-existentes + 2 novos), incluindo os 2 testes de N+1 sem
  crescimento de queries.
  **Fase Fiscal/XML** (aproveitamento financeiro, seção 18): testes novos
  em `payables.e2e-spec.ts`/`receivables.e2e-spec.ts` — geração vinculada
  ao documento fiscal com autopreenchimento refletido em `GET /fiscal/
  documents/:id` (`payable`/`receivable` populados), idempotência (409 na
  segunda tentativa para o mesmo documento), `fiscalDocumentId`
  inexistente (404), mútua exclusividade com `installments > 1` (400),
  isolamento multi-tenant.

## 12. Limitações reais / fora de escopo (declarado)

- Nenhuma validação de autenticidade perante a SEFAZ (sem certificado
  digital, sem consulta a webservice) — `VALID` é só reconhecimento de
  estrutura, nunca confundir com nota fiscalmente válida.
- Emissão de CT-e/MDF-e/NF-e, DANFE/DACTE/DAMDFE gerados pelo sistema,
  webhook fiscal, integração CIOT externa, OCR, IA, cobrança fiscal e
  integração contábil — todos fora de escopo desta fase, ver seção 16 do
  pedido original.
- `DELETE` não remove o arquivo físico nem o `Attachment` associado
  (limitação pré-existente e compartilhada com `TripRevenue`/
  `TripExpense`, não introduzida por esta fase).
- Preparação para emissão futura: a entidade já separa claramente
  `source` (`UPLOAD` vs. `XML_IMPORT`) e mantém `metadata` (JSON) para
  campos adicionais — uma futura fase de emissão real adicionaria um
  terceiro `source` (`SYSTEM_ISSUED`, por exemplo) sem quebrar o contrato
  atual.
- Preparação para integrações externas: `Attachment`/`FiscalDocument` já
  seguem o padrão polimórfico usado em todo o projeto; uma futura
  integração SEFAZ/gateway consumiria os mesmos campos (`accessKey`,
  `documentType`, `status`) sem exigir novas colunas — só novos valores de
  enum e/ou um módulo de integração separado, nunca acoplado a este.
- **Fase 57 — CIOT armazenado e validado estruturalmente pelo sistema
  não representa emissão, autorização ou validação oficial perante órgão
  externo** (ANTT ou qualquer outro). Não há integração com provedor
  CIOT, consulta automática a órgão externo, emissão oficial,
  autorização oficial, pagamento de frete ou averbação — tudo isso fica
  para fases específicas futuras. `documentNumber` é o único identificador
  reaproveitado (o mesmo campo genérico já usado por todos os tipos) —
  não existe, em nenhum lugar do projeto, um formato/algoritmo de
  validação oficial de número de CIOT para comprová-lo estruturalmente.

## 13. Validação estrutural e conformidade documental (Fase 54)

Camada **puramente derivada** (nunca persistida) que roda sobre os dados
já salvos de cada `FiscalDocument`, expondo `validationIssues:
FiscalIssueCode[]` em toda resposta que retorna o documento (upload,
importação, `PATCH`, `GET .../:id`, listagem, dashboard, status da
viagem). Lista vazia = nenhuma inconsistência identificada.

### 13.1 Motivos objetivos (`FiscalIssueCode`)

| Código | Quando dispara |
|---|---|
| `INVALID_ACCESS_KEY` | Chave de acesso presente mas com dígito verificador (DV, mod-11) incorreto. **Fase 57**: só avaliado para NF-e/CT-e/MDF-e (`RECOGNIZED_XML_TYPES`) — CIOT/DACTE/DAMDFE/comprovante de entrega/outros não têm esse formato de chave; um valor digitado nesse campo para esses tipos nunca é avaliado pelo algoritmo de NF-e (evita falso positivo). |
| `TYPE_MISMATCH` | Chave de acesso válida, mas o modelo do documento embutido nela (posições 21-22: `55`=NF-e, `57`=CT-e, `58`=MDF-e) diverge do `documentType` informado. Mesma restrição de escopo do item acima. |
| `ESSENTIAL_FIELDS_MISSING` | **Só para `source = XML_IMPORT`**: número, série, data de emissão ou emitente ausentes (e destinatário ausente, para NF-e/CT-e — MDF-e nunca exige destinatário). Upload manual (`source = UPLOAD`) **nunca** é exigido a ter esses campos — não existe regra de negócio que force isso, e exigir invalidaria uploads legítimos e esparsos (CIOT, comprovante de entrega). |
| `INCONSISTENT_DATE` | Data de emissão no futuro. |
| `DUPLICATE_CANDIDATE` | Existe **outro** documento do mesmo tenant com o mesmo `documentType` + `documentNumber` + `series` — mesmo que as chaves de acesso sejam diferentes ou ausentes. **Nunca bloqueia a escrita** (distinto da deduplicação da seção 7, que rejeita/idempotiza no momento da criação) — aqui é só um sinal para revisão manual. |
| `INCONSISTENT_LINK` | Documento vinculado a uma viagem (`tripId`), mas o `vehicleId`/`driverId` do documento diverge do veículo/motorista **reais** daquela viagem. |
| `NO_TRIP_CONTEXT` | Documento tem `vehicleId`/`driverId`/`customerId` (algum vínculo operacional) mas **não** tem `tripId`. Documento **sem nenhum vínculo** (os 4 campos nulos) não é sinalizado — mantém a semântica já existente de "sem vínculo" (seção 6/10), distinta de "tem contexto mas falta a viagem". |

Nunca valida autenticidade/autorização fiscal — só coerência estrutural
dos dados já armazenados. **Não existe** um código "XML inválido": XML
malformado ou não reconhecido é rejeitado com 400 na importação e nunca
vira um `FiscalDocument` (ver seção 12).

### 13.2 Onde aparece

- **Documento** (`FiscalDocumentEntity.validationIssues`): em toda
  resposta de leitura/escrita, drawer de detalhe mostra badges com o
  motivo e um aviso fixo "validação apenas estrutural, nunca SEFAZ".
- **Listagem/tabela do dashboard**: coluna "Situação estrutural"
  (badge verde "OK" ou contagem de inconsistências).
- **Dashboard** (`FiscalDashboardEntity`): `cancelledCount` (KPI novo),
  `alerts: FiscalIssueCountEntity[]` (contagem por motivo, gráfico de
  ranking), `problematicDocuments` com critério ampliado (seção 10).
- **Status documental da viagem** (`TripDocumentStatusEntity`):
  `structurallyValidCount` (status `VALID` **e** sem nenhuma
  inconsistência), `problematicCount`/`problematicDocuments` (mesmo
  critério ampliado), `completenessPercent`/`completenessAvailable`
  (seção 12 — sempre indisponível).

### 13.3 Performance (sem N+1)

Nenhuma query por documento. Estratégia calibrada por contexto de cada
método (ver `FiscalDocumentsService`):

- **Escrita** (`upload`/`import`/`PATCH`) e **detalhe** (`GET .../:id`):
  1 `count()` enxuto, escopado ao próprio documento, para checar
  candidato a duplicidade.
- **Listagem paginada** (`GET /fiscal/documents`) e **status da
  viagem** (`GET .../trip/:tripId/status`): 1 `groupBy` agregado
  (`getDuplicateGroupKeys`, escopo tenant inteiro) rodando em paralelo
  com a query principal — sempre 1 query fixa, nunca 1 por linha.
- **Dashboard**: a classificação reaproveita o mesmo lote já carregado
  para a série mensal (agora com mais campos selecionados), mais o
  mesmo `groupBy` de duplicidade — zero queries adicionais além dessa.

Todos calibrados para o teste real de N+1 já existente (10 vs. 50
documentos, `fiscal-documents.e2e-spec.ts`), que continua passando com
contagem de queries constante. — a validação estrutural NUNCA é validação/autorização
  SEFAZ.** Um documento sem `validationIssues` significa apenas "nenhuma
  inconsistência estrutural objetiva identificada" — nunca "nota fiscal
  autorizada/autêntica perante a Receita/SEFAZ". Não há certificado
  digital, não há consulta a webservice oficial, não há verificação de
  assinatura do XML.
- **Fase 54 — "XML inválido" nunca aparece como contador no dashboard**:
  XML malformado ou de tipo não reconhecido é rejeitado com 400 no
  momento da importação (`isWellFormedXml`/`parseFiscalXml` retornando
  falso/`null`) e **nunca chega a existir como `FiscalDocument`** — não há
  como contar algo que nunca é persistido. Um contador sempre-zero seria
  um dado forjado, por isso foi deliberadamente omitido de `alerts`.
- **Fase 54 — completude documental da viagem é sempre "indisponível"**
  (`completenessPercent: null`, `completenessAvailable: false`): não
  existe, em nenhum lugar do projeto, uma regra de negócio definindo quais
  tipos de documento uma viagem específica deveria ter — inventar um
  percentual sem esse conjunto aplicável seria dado forjado.
- **Fase 55 — "conformidade operacional" é uma classificação interna
  baseada nos dados disponíveis. Não representa autorização, autenticidade
  ou validação fiscal perante a SEFAZ.**
- **Fase 55 — relacionamento MDF-e ↔ CT-e/NF-e só existe quando o próprio
  XML já declara as chaves manifestadas** (`<chNFe>`/`<chCTe>` dentro de
  `<infDoc>`). A maioria dos XML de teste/exemplo não tem esse bloco —
  nesse caso `relatedDocumentsAvailable: false`, nunca um relacionamento
  inventado por proximidade de emitente/data. A busca reversa (CT-e/NF-e →
  qual MDF-e o manifesta) só é feita de forma limitada (bounded) quando o
  documento tem `tripId`, escaneando os MDF-e **da mesma viagem** — sem
  viagem, é declarado indisponível (nunca uma varredura sem limite em todo
  o tenant).
- **Fase 55 — candidatos a vínculo (documentos não vinculados) só
  aparecem com evidência objetiva idêntica** (mesmo `vehicleId`/`driverId`/
  `customerId` já gravado no documento) — nunca por proximidade de data,
  nome ou heurística. Uma viagem sem veículo/motorista/cliente definidos o
  suficiente para comparar nunca sugere candidatos.
- **Fase 56 — não existe preview/download do arquivo original para
  NENHUM tipo de documento no projeto** (não é uma limitação introduzida
  aqui): todo storage de `Attachment` (fiscal, evidência de checklist,
  importação de pedágio) é privado por desenho — nenhuma rota de download
  jamais foi criada em nenhuma fase anterior (ver
  `docs/SECURITY_AND_DEVELOPMENT_STANDARDS.md`, seção 10). "Visualizar" o
  comprovante de entrega, nesta fase, significa ver os DADOS do registro
  (status, data/hora, origem, observação, histórico) — nunca os bytes do
  arquivo. Implementar um endpoint de download seguro (autenticado,
  tenant-scoped, streaming) fica para uma fase futura dedicada.
- **Fase 56 — comprovante de entrega pelo Driver App só suporta foto**
  (câmera ou galeria, via `expo-image-picker`, já presente no app). PDF
  não é suportado no app do motorista porque `expo-document-picker` não
  está instalado no projeto — upload de PDF como comprovante continua
  disponível pelo painel administrativo (`POST /fiscal/documents/upload`,
  já aceita PDF desde a Fase 52).
- **Fase 56 — o limite de tamanho de arquivo do multer da rota do
  motorista (`buildDriverDeliveryProofMulterOptions`) lê
  `FISCAL_DOCUMENTS_MAX_FILE_SIZE_MB` diretamente do ambiente (nunca via
  `ConfigService`/injeção)**, porque `DriverTripsModule` já registra um
  `MulterModule` (evidência de checklist) e o Nest não permite dois
  registros concorrentes no mesmo módulo para a resolução implícita usada
  por `FileInterceptor('file')` sem opções locais — passar as opções como
  literal (suportado nativamente pelo Nest) evita a colisão. Em produção
  isso é equivalente ao `ConfigService` (variável lida uma única vez, na
  subida do processo); só não é dinamicamente reconfigurável dentro do
  mesmo processo Node em testes que mudam a env var em tempo de execução
  — por isso um teste e2e dedicado de "arquivo grande demais" para esta
  rota específica não foi escrito (o mecanismo de limite de tamanho em si
  já tem cobertura e2e no fluxo administrativo, `fiscal-documents.
  e2e-spec.ts`, "limite de upload").
- **Fase 56 — "viagens sem comprovante" no dashboard usa o mesmo
  universo de `tripsWithDocuments*`** (viagens com pelo menos 1 documento
  fiscal no filtro atual) — nunca "todas as viagens do tenant" (essa
  contagem exigiria uma query nova ao módulo Trips, fora do escopo desta
  agregação fiscal). Uma viagem sem NENHUM documento fiscal nunca aparece
  em `tripsWithDeliveryProof` nem em `tripsWithoutDeliveryProof`.

## 14. Integração fiscal ↔ viagem: conformidade operacional avançada (Fase 55)

Camada que reaproveita integralmente a validação estrutural da Fase 54
(`validationIssues`) para dar uma visão OPERACIONAL da documentação de
**uma viagem** — sem criar nenhuma regra de obrigatoriedade fiscal e sem
nenhuma tabela nova (tudo calculado sob demanda a partir do
`FiscalDocument` já existente).

> **Conformidade operacional é uma classificação interna baseada nos
> dados disponíveis. Não representa autorização, autenticidade ou
> validação fiscal perante a SEFAZ.**

### 14.1 Matriz documental da viagem

`GET /fiscal/documents/trip/:tripId/status` ganhou `matrix:
TripDocumentMatrixRowEntity[]` — 1 linha por tipo do catálogo inteiro
(`FiscalDocumentType`, 8 tipos), mesmo quando a viagem não tem nenhum
documento daquele tipo (`totalCount: 0`, `present: false` — "ausente"
nunca vira erro). Cada linha traz `totalCount`/`structurallyValidCount`/
`pendingCount`/`invalidCount`/`cancelledCount`/`problematicCount`/
`duplicateCandidateCount` (documentos deste tipo vinculados à viagem) e
`unlinkedRelatedCount` (documentos deste tipo **sem** vínculo, mas com
evidência objetiva em comum com a viagem — seção 14.4). Calculada em
memória (`buildTripDocumentMatrix`, `fiscal/utils/trip-compliance.util.ts`)
a partir do mesmo lote de documentos já carregado — zero queries extra.

### 14.2 Contexto operacional e divergências

Quando um documento está vinculado a uma viagem (`tripId` setado), a
Fase 54 já comparava `vehicleId`/`driverId` do documento contra o
veículo/motorista **reais** da viagem (`Trip.composition.vehicleId`/
`Trip.driverId`). A Fase 55 **estendeu essa mesma verificação** (nunca
duplicou) para incluir `customerId` × `Trip.customerId` — qualquer
divergência (veículo, motorista **ou** cliente) continua sinalizada com o
mesmo código `FiscalIssueCode.INCONSISTENT_LINK` já existente, reaproveitado
em `validationIssues`. Nenhum código novo foi criado para isso.

### 14.3 Relacionamento CT-e/MDF-e/NF-e (só quando derivável)

`GET /fiscal/documents/:id` ganhou `relatedDocuments:
RelatedFiscalDocumentEntity[]` (projeção leve, nunca a entity completa) e
`relatedDocumentsAvailable: boolean`. A relação **só** é reconhecida
quando o próprio XML do MDF-e já declara as chaves manifestadas
(`<chNFe>`/`<chCTe>` dentro de `<infDoc>`, extraídas pelo parser tolerante
em `fiscal-xml.parser.ts` e gravadas em `metadata.manifestedAccessKeys`
na importação) — nunca inferida por emitente/data/proximidade, nunca
grava nada novo no XML original.

- **MDF-e → CT-e/NF-e** (direção direta): busca os documentos do tenant
  cujo `accessKey` está em `metadata.manifestedAccessKeys` (1 query
  `findMany` com `accessKey: { in: [...] }`, bounded pelo tamanho do
  próprio array).
- **CT-e/NF-e → MDF-e** (direção reversa, "qual MDF-e me manifesta?"): só
  é calculada quando o documento tem `tripId` — busca os MDF-e **da mesma
  viagem** (bounded, nunca uma varredura no tenant inteiro) e filtra em
  memória os que citam a chave do documento.
- Quando não há dado suficiente para tentar (MDF-e sem
  `manifestedAccessKeys`, CT-e/NF-e sem `tripId`/`accessKey`, ou qualquer
  outro tipo — CIOT/DACTE/DAMDFE/DELIVERY_PROOF/OTHER), retorna
  explicitamente `relatedDocumentsAvailable: false` com `relatedDocuments:
  []` — nunca um vínculo inventado.

Calculado **somente** em `GET /fiscal/documents/:id` (1 documento por
vez) — nunca em listagem/dashboard, para não introduzir N+1.

### 14.4 Documentos não vinculados relacionados ao contexto

`unlinkedCandidates: FiscalDocumentEntity[]` (em `TripDocumentStatusEntity`,
até 10 itens) — documentos **sem nenhuma viagem vinculada**, mas com
`vehicleId`/`driverId`/`customerId` **idêntico** ao da viagem consultada.
Never matching agressivo: a comparação é sempre por igualdade exata de um
FK já gravado no documento (`isSafeUnlinkedCandidate`,
`trip-compliance.util.ts`) — nunca por proximidade de data, nome do
emitente ou qualquer heurística. Uma viagem sem veículo/motorista/cliente
definidos o suficiente para comparar nunca sugere candidatos (retorna
lista vazia, 0 queries extra além da checagem). O botão "Vincular" na aba
Fiscal da viagem reaproveita o mesmo `PATCH /fiscal/documents/:id` já
usado por toda edição de vínculo (Fase 53) — nenhum endpoint novo.

### 14.5 Situação documental da viagem

`complianceStatus: TripDocumentComplianceStatus` (`OK` / `ATTENTION` /
`PROBLEMATIC` / `UNAVAILABLE`), calculado por
`computeTripDocumentComplianceStatus` (pura, sem I/O):

| Situação | Quando |
|---|---|
| `UNAVAILABLE` | A viagem não tem nenhum documento fiscal — sem dado suficiente para avaliar (nunca um "problema" fantasma). |
| `PROBLEMATIC` | 1+ documento `INVALID`, OU 1+ documento `CANCELLED` com contexto na viagem, OU 1+ divergência operacional (`INCONSISTENT_LINK`, seção 14.2). |
| `ATTENTION` | 1+ documento `PENDING`, sem nenhuma das condições acima. |
| `OK` | Nenhum problema estrutural/operacional detectado. |

Dashboard (`GET /fiscal/documents/dashboard`) ganhou a mesma classificação
agregada **por viagem** (não por documento):
`tripsWithDocumentsOk`/`tripsWithDocumentsAttention`/
`tripsWithDocumentsProblematic` — calculados agrupando **em memória**
(`Map` por `tripId`) o mesmo lote de documentos já carregado para os
demais indicadores (zero queries extra); só contam viagens com pelo menos
1 documento no escopo do filtro atual (viagens sem documento nunca entram
nessa contagem, equivalente a `UNAVAILABLE`). `operationalDivergenceCount`
é extraído diretamente de `alerts[INCONSISTENT_LINK]` (nunca uma segunda
contagem paralela). `problemsMonthlyEvolution` é a evolução mensal (12
meses) do mesmo conjunto de documentos problemáticos já usado em
`problematicDocuments`, distinta de `monthlyEvolution` (que conta TODOS
os documentos).

### 14.6 Performance (Fase 55)

Nenhuma query por documento nem por viagem introduzida:

- Matriz e `complianceStatus`: 100% em memória sobre o mesmo lote já
  buscado por `getTripDocumentStatus` (Fase 53/54).
- `unlinkedCandidates`: 1 query `findMany` bounded (`take: 10`), só
  executada quando a viagem tem ao menos 1 campo comparável.
- `relatedDocuments`: 1 query bounded, só em `GET /:id` (nunca em
  listagem/dashboard).
- `tripsWithDocuments*`/`operationalDivergenceCount`/
  `problemsMonthlyEvolution`: agrupamento em memória sobre o mesmo lote já
  carregado pelo dashboard (Fase 54) — zero queries adicionais.

Testado com 10 vs. 50 documentos (mesmos testes de N+1 já existentes,
Fase 53/54) — contagem de queries permanece constante mesmo com todos os
campos novos calculados.

## 15. Comprovante de entrega + fluxo de documentação da viagem (Fase 56)

> **Comprovante de entrega é evidência documental operacional. Sua
> existência não representa validação fiscal perante a SEFAZ.**

Completa o fluxo documental operacional da viagem com foco em
`DELIVERY_PROOF` (já existente desde a Fase 52) — sem criar nenhuma
estrutura nova além de 1 coluna (`deviceEventId`, para idempotência
offline). Reaproveita integralmente `FiscalDocument`, `Attachment`,
`AuditService`, RBAC/`TenantGuard`, limite de storage e validação de
assinatura de arquivo já existentes — nenhum service/controller paralelo.

### 15.1 Modelagem (1 coluna nova, nenhuma tabela)

`FiscalDocument.deviceEventId String? @unique` — mesmo padrão já usado
por `ChecklistExecution`/`TripStop`/`FuelSupply`/`AxleEvent` para
garantir que reenviar a fila offline (`syncQueue.ts`) após reconexão
**nunca** cria um segundo comprovante. Sempre `null` para documentos
criados pelo fluxo administrativo (upload/importação) — só o Driver App
preenche esse campo.

### 15.2 Endpoint do motorista

`POST /driver/trips/:id/delivery-proof` (`DriverTripsController`, atrás
de `DriverGuard` — nunca `FiscalDocumentsController`, que exclui `DRIVER`
por RBAC desde a Fase 52). Multipart: `file` (foto/PDF) + `deviceEventId`
+ `observation`/`capturedAt` opcionais. `vehicleId`/`driverId`/
`customerId` **nunca** vêm do corpo da requisição — sempre derivados da
viagem (já validada contra o motorista autenticado pelo controller antes
de chegar ao service) e do motorista autenticado (`DriverContext`).
`observation` vai para `metadata.observation` (JSON, mesmo padrão de
`amount`/`manifestedAccessKeys`); `capturedAt` (ou o momento do
recebimento, se omitido) vai para a coluna `issueDate` já existente —
nenhuma coluna nova para "data/hora do registro".

Idempotência: antes de qualquer escrita, busca `FiscalDocument` por
`(tenantId, deviceEventId)` — se existir, descarta o arquivo recém-recebido
e devolve o documento já existente (mesmo princípio de
`importXml`/checklist evidence). Segurança preservada: `assertValidFileSignature`
(mesmas extensões/assinaturas binárias do módulo — PDF/JPG/JPEG/PNG, XML
tecnicamente aceito pela extensão mas sem sentido para uma foto),
`assertStorageUnderLimit`/`getStorageUsedBytes` (mesmo limite de plano),
`tenantId` sempre do `TenantContext` (nunca do cliente).

### 15.3 Origem do documento (`origin`)

`FiscalDocumentEntity.origin: 'DRIVER' | 'ADMIN'` — **nunca uma coluna
nova**: derivado em tempo de leitura de `creator.role` (já incluído em
toda query via `FISCAL_DOCUMENT_INCLUDE`). `DRIVER` = enviado pelo Driver
App; qualquer outro role = fluxo administrativo.

### 15.4 Status derivado do comprovante (`DeliveryProofStatus`)

Conforme pedido explícito ("se não houver entidade de entrega
estruturada suficiente, não inventar uma máquina de estados nova"), é
**sempre derivado** da linha `DELIVERY_PROOF` da matriz documental
(`buildTripDocumentMatrix`, Fase 55) — nenhum estado novo persistido:

| Status | Quando |
|---|---|
| `MISSING` | Nenhum `FiscalDocument DELIVERY_PROOF` vinculado à viagem. |
| `PENDING` | 1+ comprovante presente, `PENDING` (aguardando revisão) e sem nenhuma inconsistência estrutural. |
| `AVAILABLE` | 1+ comprovante `VALID` e sem nenhuma inconsistência estrutural. **Nunca** "arquivo existe" = prova de entrega válida por si só. |
| `PROBLEMATIC` | 1+ comprovante `INVALID`/`CANCELLED`, ou com `validationIssues` (chave/campos/duplicidade/vínculo — Fase 54), independente do status. |

**Correção de design registrada**: a primeira versão comparava
`problematicCount` (Fase 54 — que já conta `PENDING` como "precisa de
atenção") antes de `pendingCount`, tornando `PENDING` inatingível (todo
comprovante recém-enviado começa `PENDING`, logo sempre caía em
`PROBLEMATIC`). Corrigido adicionando `withIssuesCount` à matriz
(documentos com 1+ `validationIssues`, **independente do status** —
distinto de `problematicCount`) e usando `invalidCount`/`cancelledCount`/
`withIssuesCount` (nunca `problematicCount`) nesta decisão. Coberto por
teste de regressão em `trip-compliance.util.spec.ts` e pelo e2e
`fiscal-documents.e2e-spec.ts` ("Fase 56").

### 15.5 Integração com a matriz e o dashboard

`DELIVERY_PROOF` já era 1 dos 8 tipos do catálogo (`FiscalDocumentType`,
Fase 52) — a matriz documental da viagem (Fase 55) já o listava
corretamente, nenhuma mudança necessária ali além do novo campo
`withIssuesCount` (seção 15.4, compartilhado por todos os tipos).
`TripDocumentStatusEntity` ganhou `deliveryProofStatus`. `GET
/fiscal/documents/dashboard` ganhou `tripsWithDeliveryProof`/
`tripsWithoutDeliveryProof` (mesmo universo de `tripsWithDocuments*`,
Fase 55 — nunca todas as viagens do tenant, ver seção 12),
`deliveryProofCoveragePercent`/`deliveryProofCoverageAvailable` (null
quando o denominador é 0 — nunca um percentual inventado),
`deliveryProofPendingCount`/`deliveryProofProblematicCount` e
`deliveryProofMonthlyEvolution`. O filtro `documentType=DELIVERY_PROOF`
já existia (Fase 52) em `GET /fiscal/documents`/`.../dashboard` — nenhum
filtro novo necessário.

Relação com NF-e/CT-e: **nunca inventada**. Comprovante de entrega não
tem chave de acesso nem dado estruturado equivalente ao manifesto do
MDF-e (seção 14.3) — a única relação real e já existente é o vínculo
compartilhado por `tripId` (visível na matriz/lista de documentos da
mesma viagem), que já é suficiente e não exige nenhum mecanismo novo.

### 15.6 Aba Fiscal da viagem e Driver App

Seção "Comprovante de entrega" na aba Fiscal (`fiscal-tab.tsx`) — badge
de status (§15.4), lista dos comprovantes da viagem (reaproveita a MESMA
listagem já buscada para a tabela principal, nenhuma query nova),
data/hora, origem, observação (extraída de `metadata.observation`),
contagem de problemas e clique abre o drawer já existente (histórico via
`AuditService`, seção estrutural da Fase 54). **Preview/download real do
arquivo não está disponível** — ver limitação na seção 12.

Driver App: fluxo "Viagem → Entrega → Registrar comprovante"
(`DeliveryProofScreen`, botão na Home quando a viagem está em
andamento) — foto via `expo-image-picker` (câmera ou galeria, PDF não
suportado nesta fase, ver seção 12), observação opcional, confirmação.
Offline-first **sem nova fila**: reaproveita `syncQueue.ts` (novo `kind:
'delivery-proof'`), `deviceEventId` (`storage/deviceEventId.ts`) e o
padrão de persistência local de arquivo (`storage/deliveryProofFiles.ts`,
mesma lógica de `evidenceFiles.ts` da Fase 39 — copia a URI efêmera da
câmera para `documentDirectory` imediatamente após a captura, já que a
fila só guarda esse caminho persistente). Retry: `flushQueue()` (chamado
por `TripContext.refresh()`, mesmo mecanismo de toda ação offline)
reenvia com o **mesmo** `deviceEventId` — idempotência real fica no
backend (§15.1), nunca duplica.

### 15.7 Testes e performance

Ver seção 11 para o resumo completo. Performance: nenhuma query por
comprovante nem por viagem — `deliveryProofStatus` é 100% derivado da
matriz já calculada (Fase 55); os indicadores de dashboard reaproveitam o
mesmo agrupamento por viagem (`tripGroups`) e o mesmo lote de documentos
já carregado (Fase 55) — zero queries adicionais. O endpoint de escrita
(`submitDeliveryProofFromDriverApp`) segue exatamente o mesmo padrão de
queries de `upload()` (1 busca de idempotência + 1 busca da viagem + a
transação de `Attachment`+`FiscalDocument`) — não é um contexto de
listagem, não se aplica N+1.

## 16. CIOT + documentação de transporte (Fase 57)

> **CIOT armazenado e validado estruturalmente pelo sistema não
> representa emissão, autorização ou validação oficial perante órgão
> externo.**

Completa o controle operacional de CIOT reaproveitando **integralmente**
`FiscalDocument` com `documentType = CIOT` (já existente desde a Fase 52)
— **nenhuma tabela nova, nenhum service/controller paralelo, nenhuma
migration**. CIOT já participava de `ciotCount`/`byType` (Fase 53), da
matriz documental (Fase 55, que sempre iterou o catálogo `FiscalDocumentType`
inteiro) e do `TripDocumentComplianceStatus` (Fase 55, que já considera
qualquer documento vinculado à viagem, não só tipos específicos) — essa
integração já era estrutural e não exigiu mudança. O que a Fase 57
adicionou:

### 16.1 Correção de escopo da validação (`INVALID_ACCESS_KEY`/`TYPE_MISMATCH`)

Antes desta fase, `classifyFiscalDocumentIssues` avaliava o algoritmo de
dígito verificador (DV, mod-11) de NF-e/CT-e/MDF-e sobre **qualquer**
valor no campo `accessKey`, independente do `documentType`. Como CIOT
não tem chave de acesso no formato SEFAZ, um valor eventualmente digitado
nesse campo (por engano, ou por reaproveitamento do formulário genérico
de upload) seria incorretamente avaliado como "chave de acesso inválida".
Corrigido: a checagem (`INVALID_ACCESS_KEY` e, por consequência,
`TYPE_MISMATCH`) agora só roda quando `RECOGNIZED_XML_TYPES.has(documentType)`
— ou seja, exclusivamente NF-e/CT-e/MDF-e. CIOT (e DACTE/DAMDFE/
comprovante de entrega/outros) nunca são avaliados por esse algoritmo.
Coberto por teste de regressão em `fiscal-document-validation.util.spec.ts`
e `fiscal-documents.e2e-spec.ts` ("Fase 57").

### 16.2 Cadastro e vinculação

Nenhuma rota nova. CIOT é cadastrado pelo **mesmo** `POST
/fiscal/documents/upload` (metadados manuais — `documentNumber` é o
identificador reaproveitado, sem formato/algoritmo de validação oficial
definido no projeto) e vinculado pelo **mesmo** `PATCH
/fiscal/documents/:id` já usado por todos os outros tipos (Fase 53) —
`tenantId` sempre do `TenantContext`, `vehicleId`/`driverId`/`customerId`
sempre opcionais e nunca inferidos automaticamente fora do fluxo do
Driver App (que não tem fluxo de CIOT nesta fase, ver seção 16.5).
Importação de XML **não se aplica a CIOT** (o parser tolerante só
reconhece NF-e/CT-e/MDF-e, seção 5) — nenhuma lógica de extração nova foi
criada, conforme "não inventar campos fiscais que não estejam definidos
no projeto". Um campo sem fonte de dados retorna `null` (nunca inventado)
— por exemplo `accessKey` de um CIOT cadastrado manualmente é sempre
`null` a menos que o usuário digite algo ali (caso em que, pela seção
16.1, nunca é avaliado como chave de acesso).

### 16.3 Matriz, conformidade e "ausente ≠ erro"

CIOT já aparecia como 1 das 8 linhas da matriz documental (`buildTripDocumentMatrix`,
Fase 55) e já contribuía para `TripDocumentComplianceStatus` pelas MESMAS
regras genéricas de qualquer documento vinculado (status `INVALID`/
`CANCELLED`, `INCONSISTENT_LINK`) — nenhuma mudança de código foi
necessária para isso. **Nenhuma regra de obrigatoriedade foi criada**:
uma viagem sem nenhum CIOT vinculado nunca é tratada como erro (linha da
matriz com `totalCount: 0`, `complianceStatus` nunca degradado só por
isso) — não existe, em nenhum lugar do projeto, uma regra contratual/legal
configurável definindo quando um CIOT é obrigatório.

### 16.4 Dashboard (`GET /fiscal/documents/dashboard`)

Indicadores específicos de CIOT, calculados em memória sobre o mesmo lote
já carregado para os demais indicadores (`classificationRows`/`issuesById`,
Fases 54-56) — **zero queries novas**: `ciotLinkedCount`/`ciotUnlinkedCount`
(mesma semântica de `linkedCount`/`unlinkedCount`, Fase 53, só filtrada
por tipo), `ciotPendingCount`/`ciotInvalidCount` (por status),
`ciotProblematicCount` (mesmo critério de `problematicDocuments`, Fase 54:
`PENDING`/`INVALID` OU 1+ inconsistência estrutural),
`ciotOperationalDivergenceCount` (documentos CIOT com `INCONSISTENT_LINK`)
e `ciotMonthlyEvolution` (últimos 12 meses, só CIOT). O filtro
`documentType=CIOT` já existia (Fase 52) em `GET /fiscal/documents` e
`.../dashboard` — nenhum filtro novo foi necessário.

### 16.5 Aba Fiscal da viagem e frontend

Nenhuma tela nova. A seção "CIOT" foi adicionada dentro da mesma aba
Fiscal já existente (`fiscal-tab.tsx`), ao lado da matriz documental —
lista os CIOT da viagem (reaproveitando a mesma listagem já buscada para
a tabela principal, nenhuma query nova), com badge de problemas
estruturais, clique abre o mesmo drawer de detalhe (histórico via
`AuditService`, situação estrutural da Fase 54). Botões "Vincular CIOT
existente" e "Cadastrar CIOT" reaproveitam os componentes já existentes
(`LinkExistingDocumentModal`/`UploadFiscalDocumentModal`), que ganharam
props opcionais (`documentType`/`defaultDocumentType`) para filtrar/
pré-selecionar CIOT sem duplicar nenhum modal. Dashboard fiscal
(`/operations/fleet/fiscal`) ganhou uma seção "CIOT" com os indicadores
da seção 16.4.

### 16.6 Driver App

**Não implementado nesta fase**, conforme pedido explícito — não existe
fluxo operacional de CIOT já preparado no Driver App para estender sem
criar arquitetura nova (distinto do comprovante de entrega, Fase 56, que
já tinha um fluxo natural "Viagem → Entrega"). Prioridade desta fase:
administração + viagem + documentação.

### 16.7 Segurança e performance

RBAC/tenant isolation/IDOR/throttling/limites de plano/auditoria — todos
herdados sem nenhuma mudança, pois CIOT usa exatamente as mesmas rotas
(`upload`/`PATCH`/listagem/dashboard/histórico) já protegidas desde a
Fase 52. Testado isolamento cross-tenant especificamente para CIOT (seção
11). Performance: nenhuma query nova por documento/viagem/item de
ranking — todos os indicadores de CIOT são derivados em memória do mesmo
lote já carregado pelos indicadores genéricos (Fases 54-56); os 2 testes
de N+1 já existentes (`fiscal-documents.e2e-spec.ts`) continuam passando
sem crescimento de queries.

## 17. Relacionamento agregado MDF-e ↔ CT-e/NF-e (Fase 58)

Evolui a integração fiscal ↔ viagem (Fase 55, seção 14) para expor,
também em **agregado** (matriz da viagem e dashboard fiscal), a mesma
relação documental já calculada por documento desde a Fase 55 — sem
nenhuma tabela nova, nenhum service paralelo e **nenhuma migration**
(`FiscalDocument.metadata`, já existente, continua sendo a única fonte).

### 17.1 Regra (inalterada desde a Fase 55, apenas generalizada)

Uma relação entre um MDF-e e um CT-e/NF-e **só** é reconhecida quando o
array `metadata.manifestedAccessKeys` do MDF-e (extraído das tags
`<chNFe>`/`<chCTe>` do próprio XML na importação, seção 5) contém a
`accessKey` de outro documento — **nunca** por aproximação de número,
data, valor ou emitente. A Fase 58 não muda essa regra; apenas reaproveita
a mesma lógica (`extractManifestedAccessKeys`, já existente em
`computeRelatedDocuments` desde a Fase 55) para calcular a relação sobre
**lotes** de documentos já carregados, em vez de 1 documento por vez.

### 17.2 `fiscal/utils/fiscal-relationship.util.ts` (novo)

`extractManifestedAccessKeys` foi extraída do método privado que já
existia em `FiscalDocumentsService` (Fase 55) para este arquivo
compartilhado — mesma implementação, sem nenhuma mudança de
comportamento, agora reaproveitada em 4 pontos (os 2 originais de
`computeRelatedDocuments`, mais os 2 novos abaixo) em vez de duplicada.

`buildRelatedDocumentIdSet(documents)` (nova, pura, sem I/O): recebe um
array de `{id, documentType, accessKey, metadata}` já carregado e devolve
o `Set<string>` dos ids que participam de alguma relação — **as duas
pontas só contam quando ambas estão presentes no mesmo lote de entrada**.
Isso é deliberado: se o filtro atual da consulta exclui um dos lados da
relação (ex.: dashboard filtrado só por `documentType=MDFE`), esse lado
nunca é buscado por uma query adicional — a contagem simplesmente reflete
o que já está no escopo, nunca "alcança" dados fora dele. Coberto por 8
testes unitários (`fiscal-relationship.util.spec.ts`, seção 11).

### 17.3 Onde aparece

- **Matriz documental da viagem** (`TripDocumentMatrixRowEntity.relatedCount`,
  seção 14.1): por linha do catálogo (8 tipos), quantos documentos
  daquele tipo, vinculados à viagem, participam de uma relação MDF-e ↔
  CT-e/NF-e dentro do conjunto de documentos da própria viagem. Tipos sem
  nenhuma relação (incluindo CIOT/DACTE/DAMDFE/comprovante de entrega,
  que nunca participam dessa relação) ficam `0` — nunca tratado como
  erro/ausência.
- **Dashboard** (`FiscalDashboardEntity.relatedDocumentsCount`, seção 10):
  contagem de documentos (MDF-e + CT-e/NF-e) que participam de alguma
  relação dentro do escopo do filtro atual — reaproveita o mesmo
  `classificationRows` já carregado para os demais indicadores (Fases
  54-57), que ganhou 1 campo a mais no `select` (`metadata: true`).

Distinção importante: `relatedDocuments`/`relatedDocumentsAvailable`
(`GET /fiscal/documents/:id`, seção 14.3) continuam sendo o detalhe
**por documento** (inclusive a busca reversa bounded por viagem); os
campos desta seção são só **contagens agregadas** sobre lotes já
carregados — nenhum dos dois substitui o outro.

### 17.4 Performance (sem N+1)

Zero queries novas em qualquer um dos dois pontos: `getTripDocumentStatus`
já carregava todos os documentos da viagem (via `FISCAL_DOCUMENT_INCLUDE`,
que usa `include` e por isso já retornava `metadata`/`accessKey` mesmo
antes desta fase) e `getDashboard` passou a selecionar 1 campo a mais
(`metadata: true`) na mesma query `findMany` que já existia — em ambos os
casos, `buildRelatedDocumentIdSet` roda em memória sobre o lote já em
mãos. Testado com 10 vs. 50 documentos (mesmos 2 testes de N+1 já
existentes, `fiscal-documents.e2e-spec.ts`) — contagem de queries
permanece constante.

### 17.5 Limitações reais (declaradas)

- Nenhuma validação SEFAZ nova foi adicionada — `relatedCount`/
  `relatedDocumentsCount` são apenas contagens de uma relação **estrutural**
  já existente (seção 17.1), nunca confirmação de autenticidade/autorização
  fiscal.
- Quando o MDF-e não declara `manifestedAccessKeys` no XML, ou quando o
  CT-e/NF-e manifestado não está no mesmo lote consultado, a relação
  **não é contada** — informado como ausente (`0`), nunca estimado.
- Esta fase não emite, consulta SEFAZ, exige certificado digital A1/A3,
  faz manifestação do destinatário nem fecha oficialmente um MDF-e —
  tudo isso permanece fora de escopo (ver seção 12).

## 18. Aproveitamento financeiro: gerar conta a pagar/receber a partir do documento (Fase Fiscal/XML)

Fecha a lacuna "Operação → Fiscal → Financeiro" deixada em aberto desde a
Fase 52 (seção 1): quando o parser extrai um **valor real** do XML
(`metadata.amount`, NF-e/CT-e — seção 5), o usuário pode gerar um título
financeiro (`Payable`/`Receivable`, Fases 72/73) **pré-preenchido** com
esses dados, evitando redigitar fornecedor/valor/data. **Nunca automático**
— é sempre uma ação explícita do usuário, que revisa e confirma os campos
antes de criar (mesmo princípio de todo "gerar título" já existente no
projeto: `POST /payables/from-expense`, `POST /receivables/from-billing`).
O sistema nunca decide sozinho se um documento é despesa ou receita — as
duas opções ficam disponíveis lado a lado; o usuário escolhe.

### 18.1 Modelagem (2 colunas novas, nenhuma tabela)

`Payable.fiscalDocumentId String? @unique` / `Receivable.fiscalDocumentId
String? @unique` — mesmo padrão de `Payable.expenseId`/`Receivable.
billingId`: aponta para o `FiscalDocument` de origem quando o título foi
gerado a partir de um (nulo para os demais fluxos de criação). `@unique`
garante **no máximo 1 título por documento fiscal** (idempotência,
Postgres permite múltiplos `NULL` sob `unique`, então isso nunca restringe
títulos de outras origens). Relação 1:1 opcional, resolvida no mesmo
`include` de `GET /fiscal/documents` (`payable`/`receivable`, campos
`id`/`originalAmount`/`status` apenas — nunca a entity completa, evita
inflar o payload) — zero queries adicionais.

### 18.2 Fluxo

`POST /payables` e `POST /receivables` (criação manual, Fase Financeiro
CP/CR) ganharam o campo opcional `fiscalDocumentId`. Quando informado:

1. Confirma que o `FiscalDocument` existe e pertence ao tenant do usuário
   (`404` caso contrário — nunca aceita um id de outro tenant).
2. Confirma que **nenhum** outro título já referencia esse documento
   (`409` caso contrário — mensagem amigável antes da constraint `@unique`
   do banco, mesmo padrão de `assertNoDuplicate`/`findDuplicate`).
3. Rejeita a combinação com `installments > 1` (`400`) — um documento
   fiscal gera exatamente 1 título; parcelamento continua exclusivo do
   fluxo manual sem documento de origem (ver `docs/payables.md`/`docs/
   receivables.md`, seção "Título manual e parcelamento").

Nenhuma rota nova em `FiscalDocumentsController` — a criação em si
reaproveita integralmente `POST /payables`/`POST /receivables` já
existentes, só com um campo a mais no DTO.

### 18.3 Frontend

O drawer de detalhe do documento fiscal (`FiscalDocumentDetailDrawer`)
ganhou a seção "Aproveitamento financeiro", visível apenas quando
`metadata.amount` existe (a "relação clara" pedida — nunca uma lista fixa
de tipos de documento, é a presença real de um valor extraído que decide):
botões "Gerar conta a pagar"/"Gerar conta a receber" abrem os mesmos
modais de criação manual já existentes (`CreatePayableModal`/
`CreateReceivableModal`, Fase Financeiro CP/CR), agora com suporte a
`initialValues` — pré-preenchidos com `senderName` (fornecedor),
`issueDate` e o valor extraído; o campo Parcelas some do formulário nesse
fluxo (mutuamente exclusivo, seção 18.2). Quando um título já foi gerado,
o botão correspondente vira um badge "Conta a pagar/receber gerada · R$ X
· status", usando os campos já incluídos em `GET /fiscal/documents/:id`
(seção 18.1) — sem nenhuma chamada extra.

### 18.4 Limitações reais (declaradas)

- **Nunca decide despesa vs. receita automaticamente.** Um CT-e recebido
  de um transportador subcontratado é tipicamente uma despesa; um CT-e
  referente a serviço prestado pela própria transportadora poderia ser
  receita — o projeto não tem como distinguir isso de forma confiável só
  pelo XML (não há conceito de "CNPJ da própria empresa" comparável nos
  dados fiscais). Por isso as duas opções sempre ficam disponíveis; a
  decisão é sempre humana.
- **Não gera `TripExpense`/`TripBilling`.** O título criado é sempre um
  `Payable`/`Receivable` **manual** (sem `tripId`) — mesmo quando o
  documento fiscal já está vinculado a uma viagem. Estender o vínculo de
  viagem ao título gerado exigiria reabrir o desenho de "título manual
  nunca tem viagem" da Fase Financeiro CP/CR, fora do escopo desta
  correção pontual; a rastreabilidade continua garantida via
  `fiscalDocumentId` (o documento fiscal, esse sim, mantém `tripId`).
- **Nenhum autopreenchimento para estoque de peças (`PartStockMovement`).**
  O parser de XML (seção 5) só extrai o valor **total** do documento —
  nunca os itens de linha (`<det>`, produto/quantidade/preço unitário),
  que não fazem parte do escopo mínimo pedido na Fase 52. Sem essa
  extração, não há dado suficiente para pré-preencher "qual peça, qual
  quantidade" de forma confiável — inventar isso seria dado forjado.
  `PartStockMovement.reference` (texto livre, já existente desde a Fase
  83) continua sendo o único jeito de referenciar manualmente uma nota
  fiscal de compra de peças.
- **`installments` e `fiscalDocumentId` são mutuamente exclusivos** — ver
  seção 18.2. Gerar parcelas a partir de 1 documento fiscal exigiria
  decidir uma regra de rateio (por competência? por valor igual?) que o
  pedido desta fase não definiu — evitado deliberadamente.
