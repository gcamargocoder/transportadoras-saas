# Módulo Fiscal/Documental (Fase 52, estendida nas Fases 53 e 54)

Armazenamento, identificação básica e vinculação operacional de documentos
fiscais/documentais (CT-e, MDF-e, NF-e, CIOT, DACTE, DAMDFE, comprovante de
entrega e outros). **Sem emissão fiscal e sem integração com SEFAZ/gateway
nesta fase** — o módulo prepara a arquitetura (entidade central, tipos,
status, vínculo, parser tolerante de XML) para fases futuras de emissão e
integração externa, mas nada aqui se comunica com um sistema fiscal oficial.

Operação → Fiscal → Financeiro: este módulo é a camada intermediária —
documentos podem se vincular a viagens/veículos/motoristas/clientes já
existentes (Operação) e, no futuro, alimentar o módulo Financeiro (Fases
50-51, não alterado nesta fase).

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

RBAC: leitura = `SUPER_ADMIN/ADMIN/MANAGER/OPERATOR/DISPATCHER/AUDITOR`;
escrita = os mesmos exceto `AUDITOR` — mesmo grupo operacional já usado
por `toll-import`/`checklists`. `DRIVER` nunca acessa. Nenhum
`@RequireModule` aplicado nesta fase (nenhum `TenantModule` existente
descreve "Fiscal"; adicionar um valor novo ao enum não foi pedido nesta
fase e não há enforcement de módulo especificado no escopo).

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

## 13. Validação estrutural e conformidade documental (Fase 54)

Camada **puramente derivada** (nunca persistida) que roda sobre os dados
já salvos de cada `FiscalDocument`, expondo `validationIssues:
FiscalIssueCode[]` em toda resposta que retorna o documento (upload,
importação, `PATCH`, `GET .../:id`, listagem, dashboard, status da
viagem). Lista vazia = nenhuma inconsistência identificada.

### 13.1 Motivos objetivos (`FiscalIssueCode`)

| Código | Quando dispara |
|---|---|
| `INVALID_ACCESS_KEY` | Chave de acesso presente mas com dígito verificador (DV, mod-11) incorreto. |
| `TYPE_MISMATCH` | Chave de acesso válida, mas o modelo do documento embutido nela (posições 21-22: `55`=NF-e, `57`=CT-e, `58`=MDF-e) diverge do `documentType` informado. |
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
