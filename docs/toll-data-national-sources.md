# Catálogo Nacional de Fontes de Pedágio

Documento produzido na **Fase 34 — Descoberta Nacional de Fontes Oficiais de
Tarifas de Pedágio**. Esta é uma fase de **pesquisa e documentação**, não de
implementação: nenhum scraper, crawler genérico, parser de PDF ou provider
novo foi criado aqui. O objetivo é mapear com precisão onde, no Brasil, o
sistema poderia — em fases futuras — obter dados oficiais de praças e
tarifas de pedágio, e com que grau de confiança.

Pesquisa realizada em 10/08/2026, via busca web e leitura direta (somente
leitura, sem autenticação, sem burlar controle de acesso) das páginas
oficiais encontradas.

## 1. Objetivo

Determinar, para cada região do Brasil, de onde o sistema pode obter — de
forma oficial, confiável e sustentável — dados de:

1. identidade/localização de praças de pedágio;
2. tarifas (valor cobrado, por categoria/eixos);
3. vigência dessas tarifas (data de início, data de fim, documento de
   origem).

Sem presumir, sem inventar, sem classificar uma fonte como automatizável
sem evidência real de que ela expõe dado estruturado.

## 2. Critérios de fonte oficial

Uma fonte só é tratada como autoridade tarifária quando:

- pertence ao órgão regulador, poder concedente (governo federal/estadual)
  **ou à própria concessionária** (a concessionária é parte legítima para
  publicar sua própria tabela tarifária, desde que seja o domínio oficial
  dela — nunca um blog/agregador de terceiros);
- contém informação tarifária verificável (não apenas menção genérica a
  "pedágio");
- permite, mesmo que indiretamente (ex: cruzando com um ato normativo),
  identificar a vigência da tarifa.

Fontes que não atendem a esses critérios (agregadores privados, blogs,
sites de notícia) são citadas neste documento **apenas como referência
para localizar a fonte oficial real**, nunca como autoridade tarifária.

Classificação de tipo de fonte usada neste documento: `API`, `JSON`,
`CSV`, `XML`, `XLSX`, `KMZ/KML`, `PDF estruturado`, `HTML estruturado`,
`HTML dinâmico`, `página manual`, `documento sem estrutura automatizável`,
`fonte indisponível`.

Classificação de automação: `AUTOMATABLE`, `MANUAL_REVIEW`,
`NOT_AUTOMATABLE`, `UNKNOWN`.

Quando nada de confiável foi localizado, este documento registra
explicitamente **"Não localizado em fonte oficial durante esta
pesquisa."** — nunca uma suposição.

## 3. ANTT (federal)

**Órgão**: Agência Nacional de Transportes Terrestres (ANTT) — poder
concedente das concessões rodoviárias **federais**.

### 3.1 Identidade/localização de praças (já em produção — Fase 33)

- **Fonte**: `dados.antt.gov.br/dataset/praca-de-pedagio` — dataset KMZ,
  158 praças, atualizado mensalmente. **Sem campo de tarifa.**
- **Tipo**: KMZ/KML. **Automação**: `AUTOMATABLE` (já implementado em
  `AnttTollDataProvider`, Fase 33).

### 3.2 Achado novo desta fase: tarifas por concessão, estruturadas em HTML

A pesquisa da Fase 33 não havia localizado esta fonte. Nesta fase,
confirmou-se por leitura direta (WebFetch) que o portal institucional
**`gov.br/antt`** publica, para cada uma das concessões rodoviárias
federais, uma página HTML própria com a tabela de tarifas vigente:

```
https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes/{slug-da-concessao}/revisoes-e-reajustes/tarifas-de-pedagio
```

Confirmado em **3 concessões diferentes** (estrutura idêntica nas três):

| Concessão | Estado(s) | URL verificada | Colunas da tabela |
|---|---|---|---|
| Via Cristais | GO/MG | `.../via-cristais/revisoes-e-reajustes/tarifas-de-pedagio` | Categoria, Tipo de Veículo, Número de Eixos, Rodagem, Multiplicador da Tarifa, Valores (R$) por praça P1–P7 |
| Transbrasiliana | SP | `.../Transbrasiliana/tarifas-de-pedagio` | idem, 4 praças (P1–P4) |
| Autopista Régis Bittencourt | SP/PR | `.../autopista-regis-bittencourt/tarifas-de-pedagio` | idem, 6 praças (P1–P6) |

Cada concessão também tem uma página irmã de localização de praças:
`.../{slug}/revisoes-e-reajustes/localizacao-das-pracas-de-pedagio`.

O slug de URL **não é uniformemente derivável do nome** (ex.:
`via-cristais` minúsculo-hifenizado vs. `Transbrasiliana`
capitalizado-sem-hífen) — não deve ser adivinhado por transformação de
string; precisa ser extraído dos links reais da página-índice
`.../concessionarias/lista-de-concessoes`, que lista as **41 concessões
federais ativas** (mais algumas com contrato encerrado/caducidade
declarada, listadas mas não operacionais). Isso é uma leitura de página
HTML pública seguida de leitura de subpáginas — **não** é scraping frágil
nem browser automation: são requisições HTTP simples de leitura sobre
HTML servidor-renderizado.

**Limitação confirmada**: nenhuma das 3 páginas verificadas mostra
explicitamente a **vigência** (data de início) da tarifa na própria
tabela — apenas um carimbo genérico de "Publicado em" / "Atualizado em"
do CMS, que não é a mesma coisa que a data de vigência oficial da
tarifa.

### 3.3 Achado complementar: base de atos normativos (ANTTlegis) com vigência

`anttlegis.antt.gov.br` é a base de atos regulatórios da ANTT — confirmado
por leitura direta de uma "Decisão SUROD" real (nº 262/2026, Ecovias Rio
Minas, BR-116/465/493/RJ/MG): documento em **HTML puro** (não PDF),
contendo tabela tarifária completa por categoria/praça **e** a vigência
explícita ("Esta Decisão entra em vigor à zero hora do dia 22/03/2026").
A busca indicou que a categoria "Decisões da SUROD" sozinha tem **3.848
registros**, organizados por concessionária e assunto, com pesquisa
avançada — ou seja, é uma base grande e real, mas encontrar "qual é a
decisão mais recente de cada concessão" exige busca/indexação, não é um
link direto único por concessão.

**Conclusão prática**: a tabela de tarifas vigente por concessão
(`gov.br/antt/.../tarifas-de-pedagio`) já mostra o **valor atualmente
cobrado**; o ANTTlegis supre a **vigência/número da decisão** quando
necessário, mas exige uma segunda etapa de busca. Uma futura automação
poderia usar a tabela como fonte primária de valor e tratar `collectedAt`
(data da coleta) como aproximação de vigência quando a decisão específica
não for localizada — nunca inventando uma data de vigência não
confirmada.

### 3.4 Classificação final ANTT

| Campo | Praças (KMZ) | Tarifas por concessão (HTML) | Vigência (ANTTlegis) |
|---|---|---|---|
| Tipo de fonte | KMZ/KML | HTML estruturado | HTML estruturado (base de atos) |
| Tarifa disponível | Não | **Sim**, por categoria/eixos/praça | Sim (dentro do texto do ato) |
| Vigência disponível | N/A | Não (só timestamp de CMS) | **Sim**, explícita |
| Automação | AUTOMATABLE (já implementado) | **AUTOMATABLE** (crawler leve: 1 página-índice + N subpáginas) | MANUAL_REVIEW (busca/indexação necessária) |
| Cobertura | 158 praças | 41 concessões federais, todos os estados atravessados por rodovia federal concedida | Nacional (mas por ato individual) |
| Frequência de atualização | Mensal (dataset) | Por reajuste/revisão contratual (irregular, tipicamente anual) | Por decisão publicada |

## Nota metodológica sobre profundidade de verificação

Dado o tamanho do território pesquisado, nem todo estado recebeu o mesmo
nível de aprofundamento. As seções abaixo indicam explicitamente, em cada
caso, se a fonte foi **verificada por leitura direta (WebFetch)** da
página real, ou apenas **localizada por busca** (WebSearch, sem leitura
estrutural confirmada) — a segunda categoria está sujeita a uma reverificação
antes de qualquer decisão de automação. Em nenhum caso um dado foi
completado por suposição.

Um padrão importante emergiu durante a pesquisa: **muitas rodovias
pedagiadas em estados do Sul/Sudeste/Centro-Oeste são, na verdade,
concessões FEDERAIS (ANTT)**, não estaduais — a concessão pode ter sido
originalmente estadual e federalizada, ou nunca ter sido estadual. Nesses
casos, a fonte federal já documentada na seção 3 é a fonte primária, e a
agência estadual (quando existe) tem papel residual ou nenhum sobre
aquela rodovia específica.

## 4. São Paulo

**Órgãos**: ARTESP (Agência de Transporte do Estado de São Paulo,
concessões estaduais) e DER-SP (rodovias não concedidas). Também
atravessado por diversas concessões **federais** ANTT (Autopista Régis
Bittencourt, RioSP, Transbrasiliana, Nova Dutra — contrato encerrado —,
Motiva Minas SP), já cobertas na seção 3.

- **Concessões estaduais (ARTESP)**: 13 concessionárias — Autoban,
  Intervias, Rota das Bandeiras, Rodovias das Colinas, CART, ViaRondon,
  SPVias, Rodovias do Tietê, Ecovias dos Imigrantes, Ecovias do Leste
  Paulista, Rodoanel Oeste, SPMAR, Rodovia dos Tamoios (reajuste
  confirmado em julho/2026, IPCA ~4,72%, Tamoios ~5,08%).
- **Fonte oficial de tarifa**: `artesp.sp.gov.br/artesp/setor-regulado/rodovia/pedagios`
  — **verificado por leitura direta**: página é só um índice com 3 links
  em PDF ("Valor Atual das Tarifas", "Histórico de Tarifas — Contratos
  Vigentes", "Histórico de Tarifas — Contratos Encerrados"). **Nenhuma
  tabela HTML.** Confirma o achado da Fase 33.
- **Portal de dados abertos**: `dadosabertos.artesp.sp.gov.br/dataset/pedagio`
  — **verificado por leitura direta** (inclusive um resource-ID específico
  não checado na Fase 33): "Formato: desconhecido", "Datastore active:
  False", sem arquivo estruturado — é apenas um ponteiro de metadado para
  a página institucional acima.
- **Concessionária isolada testada** (Ecovias dos Imigrantes,
  `ecoviasimigrantes.com.br/servicos/tarifas-pedagio`): **HTTP 403
  Forbidden** ao tentar leitura direta — indício de proteção anti-bot no
  domínio da concessionária. Não foi feita nenhuma tentativa de
  contornar.
- **DER-SP**: já pesquisado na Fase 33 — `ValoresPedagio.aspx` retorna
  HTTP 200 mas sem `<table>`/`<tr>` nem assinatura de grid, aparenta
  depender de postback/JavaScript.

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| PDF estruturado (ARTESP institucional) | Sim (em PDF) | Não nesta página | Só dentro do PDF | `MANUAL_REVIEW` |
| Dados abertos ARTESP | Não (ponteiro vazio) | Não | Não | `NOT_STRUCTURED` |
| Concessionária (Ecovias) | Desconhecido (bloqueado) | Desconhecido | Desconhecido | `UNKNOWN` (bloqueio anti-bot) |
| DER-SP (ValoresPedagio.aspx) | Desconhecido | Desconhecido | Desconhecido | `UNKNOWN` (provável HTML dinâmico) |

Data da pesquisa: 10/08/2026 (aprofundamento sobre a base já levantada na
Fase 33).

## 5. Minas Gerais

**Órgão regulador confirmado**: **ARTEMIG** (Agência Reguladora de
Transportes do Estado de Minas Gerais) — autoriza reajustes tarifários
anuais de concessões rodoviárias estaduais/PPP (ex: rodovias do Sul de
Minas, MG-050). **DER-MG** é o órgão de infraestrutura (poder concedente
técnico). Várias concessões em MG são **federais** (Ecovias Rio Minas,
Ecovias Cerrado, Ecovias Minas Goiás, Nova 381, Way-262, Way-153, EPR Via
Mineira, Elovias, Ecovias das Gerais — já cobertas na seção 3).

- **Fonte candidata**: `artemig.mg.gov.br/artemig/resolucoes/` — página de
  resoluções (atos regulatórios, mesmo modelo conceitual do ANTTlegis).
  **Não verificado por leitura estrutural**: a tentativa de WebFetch
  falhou por erro de certificado TLS (`unable to get local issuer
  certificate`) — uma limitação técnica real do próprio domínio, não uma
  suposição. Precisa ser retestado com uma ferramenta que tolere a cadeia
  de certificado do servidor, ou verificado manualmente.
- Reajustes de tarifa são noticiados publicamente (ex: pedágio do Sul de
  Minas de R$15,00 para R$15,80 em julho/2026) mas a fonte primária
  oficial (resolução ARTEMIG) não foi lida diretamente nesta pesquisa.

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| Resoluções ARTEMIG | Provável (não confirmado por leitura) | Desconhecido | Provável (resoluções costumam ter) | `UNKNOWN` (falha técnica de TLS nesta pesquisa) |

Data da pesquisa: 10/08/2026.

## 6. Paraná

**Órgão regulador confirmado**: **AGEPAR** (Agência Reguladora de
Serviços Públicos Delegados de Infraestrutura do Paraná) — aprovou
Resoluções Normativas (004, 005, 006) sobre revisão tarifária de
concessões rodoviárias. **DER-PR** é o poder concedente técnico
histórico (Anel de Integração, 1997, 47 trechos). Muitas concessões do PR
hoje aparecem como **federais** na listagem ANTT (EPR Paraná, Via
Araucária, EPR Litoral Pioneiro, EPR Iguaçu, Motiva Paraná, Via Campo,
EPR Paraná, Autopista Litoral Sul, Autopista Planalto Sul, Autopista
Régis Bittencourt) — sugerindo que parte relevante da malha
originalmente estadual foi federalizada ao longo do tempo. Não foi
confirmado nesta pesquisa se a AGEPAR ainda regula alguma concessão
ativa isoladamente ou se seu papel atual é majoritariamente histórico/
residual.

- **Fonte candidata**: `agepar.pr.gov.br` — não foi encontrada, nesta
  pesquisa, uma página de tabela tarifária dedicada (só notícias e atos
  regulatórios avulsos). **Não localizado em fonte estruturada durante
  esta pesquisa.**
- `der.pr.gov.br/Pagina/Concessoes-Rodoviarias` — página institucional
  listando concessões, não verificada por leitura direta.

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| AGEPAR (institucional) | Não localizado em fonte estruturada durante esta pesquisa | Não localizado | Não localizado | `UNKNOWN` |

Data da pesquisa: 10/08/2026.

## 7. Rio de Janeiro

**Órgão regulador confirmado**: **AGETRANSP** (Agência Reguladora de
Serviços Públicos Concedidos de Transportes Aquaviários, Ferroviários,
Metroviários e de Rodovias do RJ). Regula pelo menos 2 concessões
estaduais com pedágio: **Via Lagos (RJ-124)** e **Rota 116 (RJ-116)**.
Também tem Plano de Dados Abertos (Lei Estadual 9.128/2020) publicando em
`dadosabertos.rj.gov.br`. Concessões federais no RJ (Autopista Fluminense,
Ecovias Ponte, RioSP, Ecovias Rio Minas) já cobertas na seção 3.

**Melhor achado estadual desta pesquisa**: `agetransp.rj.gov.br/concessionarias/vialagos`
— **verificado por leitura direta**: tabela HTML completa com tarifa por
categoria de veículo (motos a caminhões de 6 eixos), multiplicador por
configuração de eixos, valores para dia útil vs. fim de semana/feriado, **e
vigência explícita** ("Cobrança praticada a partir de 01/08/2025",
referenciando a "Deliberação N. 1630 de 29/07/2025"). É a fonte estadual
mais completa encontrada em toda esta pesquisa — melhor até que a página
federal da ANTT (que não mostra vigência).

Página equivalente para Rota 116 (`agetransp.rj.gov.br/concessionarias/rota116`)
existe mas não foi lida diretamente nesta pesquisa — presume-se estrutura
igual por ser o mesmo CMS/padrão institucional, **mas isso não foi
confirmado por leitura e não deve ser tratado como certeza**.

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| `agetransp.rj.gov.br/concessionarias/{slug}` (Via Lagos, confirmado) | **Sim**, por categoria/eixos | Não nesta página | **Sim**, explícita | `AUTOMATABLE` |
| Rota 116 (mesmo padrão, não confirmado) | Provável | Provável | Provável | `MANUAL_REVIEW` (confirmar antes de automatizar) |
| Dados abertos RJ (`dadosabertos.rj.gov.br`) | Não verificado nesta pesquisa | — | — | `UNKNOWN` |

Data da pesquisa: 10/08/2026.

## 8. Santa Catarina

**Órgão de infraestrutura**: DEINFRA (Departamento Estadual de
Infraestrutura). Nenhuma agência reguladora estadual de pedágio dedicada
foi confirmada nesta pesquisa (buscou-se "ARTESC" sem retorno). A
concessão de maior destaque em SC (**Arteris Litoral Sul**, praças em
Garuva, Araquari, Porto Belo, Palhoça) é **concessão federal** com
contrato assinado com a ANTT (BR-116/BR-376/BR-101) — corresponde à
"Autopista Litoral Sul" já listada na seção 3. Isso sugere que a maior
parte (talvez a totalidade) da malha pedagiada de SC é federal, não
estadual.

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| DEINFRA (institucional) | Não localizado em fonte oficial durante esta pesquisa | Não localizado | Não localizado | `UNKNOWN` |
| Cobertura via ANTT (Autopista Litoral Sul) | Sim (ver seção 3) | Sim (ver seção 3) | Ver seção 3 | `AUTOMATABLE` (via fonte federal) |

Data da pesquisa: 10/08/2026.

## 9. Rio Grande do Sul

**Modelo institucional diferente**: a **EGR (Empresa Gaúcha de
Rodovias)** é uma **empresa pública estadual** que opera diretamente 10
praças de pedágio (não uma concessão a operador privado) — um modelo
distinto de "concessionária regulada por agência", que a Fase 34
explicitamente pediu para identificar. Praças conhecidas: Boa Vista do
Sul, Cruzeiro do Sul (RSC-453), Flores da Cunha (ERS-122), Gramado
(ERS-235), Santo Antônio da Patrulha (ERS-474), São Francisco de Paula
(ERS-020), Três Coroas (ERS-115), Viamão (ERS-040), entre outras (total
declarado: 10). Também existe o **DAER** (Departamento Autônomo de
Estradas de Rodagem) como órgão histórico de infraestrutura.

- **Fonte candidata**: `egr.rs.gov.br/pracas-de-pedagio` — **verificado
  por leitura direta**: é uma página de navegação/landing com um mapa
  interativo (dados do mapa não vieram no HTML estático), **sem** tabela
  de tarifas, sem lista textual de praças, sem CSV/JSON/XLSX. Classificada
  como `HTML dinâmico`.
- O governo estadual já anunciou que futuras rodovias serão concedidas à
  iniciativa privada com free-flow — ou seja, o modelo pode mudar nos
  próximos anos.

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| EGR (site institucional) | Não (só menção genérica) | Não (mapa interativo, sem dado estático) | Não | `NOT_AUTOMATABLE` (nesta página) |

Data da pesquisa: 10/08/2026.

## 10. Bahia

**Órgão regulador confirmado**: **AGERBA** (Agência Estadual de
Regulação de Serviços Públicos de Energia, Transportes e Comunicações da
Bahia) — autoriza reajustes de concessões rodoviárias estaduais (ex:
sistema BA-093/BA-524/BA-526/BA-535, BA-099 via Concessionária Litoral
Norte). Publica notícias de reajuste em `ba.gov.br/agerba/noticias/`.
**Não foi localizada nesta pesquisa** uma página de tabela tarifária
estruturada (HTML ou arquivo) — apenas notícias e um portal institucional
(`agerba.ba.gov.br`) não explorado em profundidade. A concessão federal
"Via Bahia" (contrato encerrado, segundo a listagem ANTT) também atuou no
estado.

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| AGERBA (notícias/institucional) | Mencionado em notícia, não em fonte estruturada | Não localizado | Não localizado (datas de reajuste aparecem em notícia, não confirmadas na fonte primária) | `UNKNOWN` |

Data da pesquisa: 10/08/2026.

## 11. Goiás

**Achado principal**: as concessões rodoviárias pedagiadas de Goiás
identificadas nesta pesquisa (Ecovias Araguaia, Ecovias Cerrado, Ecovias
Minas Goiás, Rota Verde Goiás, Way-364, Way-153, Via Cristais, CONCEBRA)
são **todas federais**, já cobertas pela fonte ANTT documentada na seção
3. Buscou-se uma agência estadual goiana ("AGR" — Agência Goiana de
Regulação) mas **não foi encontrada evidência de papel regulatório sobre
tarifa de pedágio** nesta pesquisa — pode existir mas não foi confirmada.

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| Cobertura via ANTT (múltiplas concessões) | Sim (ver seção 3) | Sim (ver seção 3) | Ver seção 3 | `AUTOMATABLE` (via fonte federal) |
| Agência estadual (AGR) | Não localizado em fonte oficial durante esta pesquisa | — | — | `UNKNOWN` |

Data da pesquisa: 10/08/2026.

## 12. Espírito Santo

**Órgão regulador confirmado**: **ARSP** (Agência de Regulação de
Serviços Públicos do Espírito Santo) — regula, entre outros setores,
"infraestrutura viária com pedágio" (`arsp.es.gov.br/infraestrutura-viaria`,
`arsp.es.gov.br/concessao-infraestrutura`). **Existência da agência e do
seu escopo sobre pedágio confirmada por busca**; a estrutura exata da
página de tarifas **não foi verificada por leitura direta** nesta
pesquisa (limite de tempo/ferramentas desta fase). A concessão federal
"Ecovias Capixaba" (ES/BA) e "ECO101" também atuam no estado (seção 3).

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| ARSP (existência confirmada, estrutura não lida) | Desconhecido | Desconhecido | Desconhecido | `UNKNOWN` (requer leitura direta antes de classificar) |
| Cobertura via ANTT (Ecovias Capixaba, ECO101) | Sim (ver seção 3) | Sim (ver seção 3) | Ver seção 3 | `AUTOMATABLE` (via fonte federal) |

Data da pesquisa: 10/08/2026.

## 13. Mato Grosso

**Achado principal**: não foi confirmada, nesta pesquisa, nenhuma
concessão rodoviária estadual pedagiada **atualmente em operação** em
Mato Grosso. O que foi encontrado é um processo de licitação em
andamento conduzido pela **SINFRA** (Secretaria de Estado de
Infraestrutura e Logística) para concessionar ~931,5 km de rodovias
estaduais (incluindo a MT-220, com tarifas projetadas entre R$7,90 e
R$8,30, ainda não cobradas). A concessão federal "Nova Rota do Oeste"
(MT) e "Way-364"/"Via Brasil BR-163" (MT/PA) já cobrem parte da malha
federal do estado (seção 3).

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| SINFRA-MT (concessões estaduais) | Não — tarifas ainda projetadas, sem cobrança ativa confirmada | Não | Não aplicável (pré-operacional) | `NOT_AUTOMATABLE` (nada operacional a automatizar ainda) |
| Cobertura via ANTT (Nova Rota do Oeste, Way-364, Via Brasil BR-163) | Sim (ver seção 3) | Sim (ver seção 3) | Ver seção 3 | `AUTOMATABLE` (via fonte federal) |

Data da pesquisa: 10/08/2026.

## 14. Mato Grosso do Sul

**Órgão regulador confirmado**: **AGEPAN** (Agência Estadual de
Regulação de Serviços Públicos de Mato Grosso do Sul, publicada também
como AGEMS) — homologa tarifas de concessões estaduais, incluindo a
concessionária **Way 306** (sistema MS-306/BR-359) e uma ponte sobre o
Rio Paraguai. Publica portarias de homologação
(`agems.ms.gov.br/rodovias-4/` e notícias). **Não foi localizada nesta
pesquisa** uma página de tabela tarifária HTML estruturada — as portarias
individuais (PDF, prováveis) não foram lidas diretamente. A concessão
federal "Motiva Pantanal" (BR-163/MS, com o reajuste de ~40,5%
confirmado na pesquisa da ANTT, seção 3) também atua no estado.

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| AGEPAN/AGEMS (portarias) | Mencionado em portaria (provável PDF) | Não localizado | Provável (portarias costumam ter data de vigência) | `MANUAL_REVIEW` (requer leitura de portarias individuais) |
| Cobertura via ANTT (Motiva Pantanal) | Sim (ver seção 3) | Sim (ver seção 3) | Ver seção 3 | `AUTOMATABLE` (via fonte federal) |

Data da pesquisa: 10/08/2026.

## 15. Pernambuco

**Órgão regulador confirmado**: **ARPE** (Agência de Regulação de
Pernambuco) — regula 2 concessões estaduais: **CRC** (Rota dos
Coqueiros/Acesso à Praia do Paiva) e **CRA** (Rota do Atlântico/Via
Expressa SUAPE).

**Verificado por leitura direta**: `arpe.pe.gov.br/tarifas2/rodovia` — é
um **repositório de documentos** (pareceres técnicos, resoluções,
audiências públicas) organizado por ano (2010–2026), **sem tabela HTML
de tarifas na própria página**. Os valores reais estão dentro dos PDFs
individuais (ex: "Parecer Técnico CT nº 02/2023"). Classificado como
`PDF estruturado` (documentos individuais provavelmente têm tabela +
vigência, mas cada um exigiria download e parsing próprio).

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| ARPE (`tarifas2/rodovia`) | Sim, mas só dentro de PDFs individuais | Não nesta página | Provável, dentro de cada PDF | `MANUAL_REVIEW` |

Data da pesquisa: 10/08/2026.

## 16. Ceará

**Órgão regulador confirmado por existência**: **ARCE** (Agência
Reguladora de Serviços Públicos Delegados do Estado do Ceará). Não foi
encontrada, nesta pesquisa, evidência de nenhuma concessão rodoviária
pedagiada estadual ativa no Ceará — o estado não é conhecido por ter
rodovias pedagiadas relevantes (nem estaduais nem federais, até onde a
pesquisa alcançou). **Não localizado em fonte oficial durante esta
pesquisa.**

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| ARCE / geral | Não localizado em fonte oficial durante esta pesquisa | Não localizado | Não localizado | `UNKNOWN` |

Data da pesquisa: 10/08/2026.

## 17. Pará

Não foi encontrada, nesta pesquisa, evidência de agência reguladora
estadual ("ARCON-PA" buscado sem retorno específico) com papel sobre
pedágio. A cobertura pedagiada do Pará identificada é a concessão
**federal** "Via Brasil BR-163" (MT/PA, 1.001,20 km — a maior concessão
federal em extensão da lista obtida), já coberta na seção 3.

| Formato | Tarifa disponível | Localização disponível | Vigência | Automação |
|---|---|---|---|---|
| Agência estadual | Não localizado em fonte oficial durante esta pesquisa | — | — | `UNKNOWN` |
| Cobertura via ANTT (Via Brasil BR-163) | Sim (ver seção 3) | Sim (ver seção 3) | Ver seção 3 | `AUTOMATABLE` (via fonte federal) |

Data da pesquisa: 10/08/2026.

## 18. Demais estados

Não pesquisados individualmente nesta fase (fora do escopo de
aprofundamento definido, e sem indício, na listagem de concessões
federais já obtida — seção 3 —, de rodovia pedagiada relevante na maioria
deles): Alagoas, Sergipe, Paraíba, Rio Grande do Norte, Piauí, Maranhão,
Amazonas, Acre, Roraima, Amapá, Distrito Federal.

Exceções identificáveis a partir da própria listagem federal já
levantada (seção 3), sem pesquisa estadual adicional:

- **Tocantins**: coberto por concessões federais "Ecovias Araguaia"
  (TO/GO) e parte de "BR-153/BR-414/BR-080" mencionada na pesquisa de
  Goiás.
- **Rondônia**: coberto pela concessão federal "Nova 364" (RO).
- **Distrito Federal**: coberto pelas concessões federais "CONCEBRA"
  (DF/GO) e "VIA 040" (DF/GO/MG, contrato encerrado).

Para os demais (Alagoas, Sergipe, Paraíba, Rio Grande do Norte, Piauí,
Maranhão, Amazonas, Acre, Roraima, Amapá): **não localizado em fonte
oficial durante esta pesquisa** — nem concessão estadual nem federal foi
identificada nesta fase. Isso não significa necessariamente que não
exista pedágio nesses estados, apenas que esta pesquisa não a confirmou;
uma varredura dedicada fica como trabalho futuro se algum desses estados
se tornar relevante para a base de clientes do sistema.

## 19. Inventário de cobertura nacional (consolidado)

| Região/UF | Cobertura principal | Fonte | Praças | Tarifas | Vigência | Formato | Automação |
|---|---|---|---|---|---|---|---|
| Federal (todas as UF com rodovia federal concedida) | 41 concessões ANTT | `gov.br/antt/.../{concessão}/revisoes-e-reajustes/` | 158 (dataset KMZ) + por concessão (não somado) | Sim | Parcial (via ANTTlegis) | HTML estruturado + KMZ | `AUTOMATABLE` |
| SP (estadual) | 13 concessionárias ARTESP | `artesp.sp.gov.br/.../pedagios` | UNKNOWN | Sim (só PDF) | Dentro do PDF | PDF estruturado | `MANUAL_REVIEW` |
| RJ (estadual) | Via Lagos, Rota 116 (AGETRANSP) | `agetransp.rj.gov.br/concessionarias/{slug}` | UNKNOWN | Sim | **Sim, explícita** | HTML estruturado | `AUTOMATABLE` |
| MG (estadual) | ARTEMIG (resoluções) | `artemig.mg.gov.br/artemig/resolucoes/` | UNKNOWN | Provável | Provável | UNKNOWN (falha de TLS na verificação) | `UNKNOWN` |
| PR (estadual) | AGEPAR (papel residual?) | não localizada página de tabela | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | `UNKNOWN` |
| SC (estadual) | não identificada agência dedicada | — | UNKNOWN | Não localizado | Não localizado | — | `UNKNOWN` |
| RS (EGR, empresa pública) | 10 praças (EGR) | `egr.rs.gov.br/pracas-de-pedagio` | 10 (declarado, não listado) | Não | Não | HTML dinâmico | `NOT_AUTOMATABLE` |
| BA (estadual) | AGERBA | não localizada página de tabela | UNKNOWN | Mencionado em notícia | Não confirmado | UNKNOWN | `UNKNOWN` |
| GO (estadual) | não confirmada agência com papel ativo | — | UNKNOWN | Não localizado | Não localizado | — | `UNKNOWN` |
| ES (estadual) | ARSP (existência confirmada) | `arsp.es.gov.br/infraestrutura-viaria` | UNKNOWN | Não verificado | Não verificado | Não verificado | `UNKNOWN` |
| MT (estadual) | sem concessão operacional confirmada | SINFRA (licitação em curso) | 0 (pré-operacional) | Não (projeção) | Não aplicável | — | `NOT_AUTOMATABLE` |
| MS (estadual) | AGEPAN/AGEMS | `agems.ms.gov.br/rodovias-4/` | UNKNOWN | Sim, em portaria (PDF provável) | Provável | MANUAL_REVIEW | `MANUAL_REVIEW` |
| PE (estadual) | ARPE — CRC, CRA | `arpe.pe.gov.br/tarifas2/rodovia` | UNKNOWN | Sim, só em PDFs individuais | Provável, por PDF | PDF estruturado | `MANUAL_REVIEW` |
| CE | sem concessão pedagiada identificada | — | 0 (não confirmado) | Não localizado | Não localizado | — | `UNKNOWN` |
| PA (estadual) | sem agência/concessão estadual identificada | cobertura via ANTT (Via Brasil BR-163) | Ver seção 3 | Ver seção 3 | Ver seção 3 | HTML estruturado (federal) | `AUTOMATABLE` (via federal) |
| TO, RO, DF | cobertos apenas via concessão federal | Ver seção 3 | Ver seção 3 | Ver seção 3 | Ver seção 3 | HTML estruturado (federal) | `AUTOMATABLE` (via federal) |
| AL, SE, PB, RN, PI, MA, AM, AC, RR, AP | não pesquisados nesta fase | — | UNKNOWN | Não localizado | Não localizado | — | `UNKNOWN` |

`UNKNOWN` na coluna Praças significa: quantidade não confirmada nesta
pesquisa — nunca um número inventado.

## 20. Avaliação do modelo de dados atual (`TollDataSource`)

O modelo `TollDataSource` (schema Prisma) tem hoje: `id`, `provider`
(enum `TollDataProvider` — `ANTT | ARTESP | OTHER`, com `@unique`),
`name`, `authority`, `baseUrl`, `enabled`, `lastSyncAt/lastSuccessAt/
lastFailureAt/lastError`, `createdAt/updatedAt`.

**Ele representa bem** os campos descritivos de UMA fonte (nome,
autoridade, URL base, estado de saúde). **Não precisa de nenhum campo
novo para o que foi descoberto nesta fase** — nenhuma migration foi
proposta ou implementada.

**Limitação identificada (não uma falta de campo, uma restrição de
cardinalidade)**: `provider TollDataProvider @unique` permite **1 linha
por valor do enum**. O enum hoje só tem `ANTT | ARTESP | OTHER`. Se no
futuro (Fase 35+) forem implementados múltiplos providers estaduais
(ex: RJ/AGETRANSP, MG/ARTEMIG, PE/ARPE), cada um precisaria de **seu
próprio valor de enum** (`RJ_AGETRANSP`, `MG_ARTEMIG`, etc.) — usar
`OTHER` para todos colidiria no `@unique`, já que só pode haver 1 linha
`OTHER`.

**Isso não é um problema desta fase** (nenhum provider novo foi
implementado), mas é uma decisão a tomar **antes** da Fase 35 escolher
seu primeiro provider estadual: estender o enum `TollDataProvider` (uma
migration pequena e aditiva, sem alterar dado existente) no momento em
que o primeiro provider estadual for de fato implementado — nunca
antes, por conveniência. A interface TypeScript `TollDataProviderPort.provider`
(`'ANTT' | 'ARTESP' | 'OTHER'`) precisaria do mesmo ajuste, no mesmo
momento.

Nenhuma segunda tabela de tarifa foi cogitada nem necessária — `TollRate`
continua sendo a única tabela de tarifa, e o modelo de vigência
(`effectiveFrom/effectiveUntil/sourceDocument/sourceReference/
collectedAt`) já comporta perfeitamente os documentos encontrados nesta
pesquisa (decisões ANTT, deliberações AGETRANSP, portarias AGEPAN/ARPE).

## 21. Matriz de prioridade para a Fase 35

**PRIORIDADE 1** — fonte oficial, tarifa estruturada, vigência
estruturada, automação confiável:
- **ANTT — tarifas por concessão** (`gov.br/antt/.../tarifas-de-pedagio`,
  41 concessões, HTML estruturado, cobre a maior parte do território
  nacional por via federal). Vigência requer cruzamento com ANTTlegis
  (ver 21.1 abaixo) ou pode usar `collectedAt` como aproximação
  documentada.
- **RJ — AGETRANSP** (`agetransp.rj.gov.br/concessionarias/vialagos`,
  confirmado com vigência explícita na própria página — a fonte mais
  completa encontrada nesta pesquisa).

**PRIORIDADE 2** — fonte oficial, tarifa disponível, formato
relativamente estruturado, automação possível com parser específico:
- **ANTT — ANTTlegis** (decisões SUROD, HTML puro, vigência explícita,
  mas requer busca/indexação por concessão em vez de link direto).
- **PE — ARPE** (`tarifas2/rodovia`, PDFs individuais bem organizados por
  ano/concessão — precisaria de um parser de PDF dedicado).
- **MS — AGEPAN/AGEMS** (portarias, provavelmente PDF, padrão parecido).

**PRIORIDADE 3** — fonte oficial, tarifa disponível, formato manual/
dinâmico, requer revisão:
- **SP — ARTESP** (PDF institucional "Valor Atual das Tarifas" —
  cobre 13 concessionárias estaduais de um estado com grande volume de
  tráfego, compensa o esforço manual apesar do formato).
- **MG — ARTEMIG** (resoluções, formato ainda não confirmado por falha
  técnica de TLS nesta pesquisa — precisa reverificação antes de
  decidir a prioridade real).

**PRIORIDADE 4** — fonte oficial não estruturada, sem automação segura:
- **RS — EGR** (HTML dinâmico, mapa interativo sem dado estático).
- **DER-SP `ValoresPedagio.aspx`** (já classificado assim na Fase 33).
- **PR — AGEPAR** (nenhuma página de tabela localizada; papel sobre
  concessões ativas não está claro).
- **BA — AGERBA**, **SC**, **GO**, **ES** (existência de agência
  confirmada ou parcialmente confirmada, mas sem fonte estruturada
  localizada nesta pesquisa).

**PRIORIDADE 5** — fonte não confirmada:
- **CE, PA (estadual), MT (estadual — sem concessão operacional ainda),
  e os 10 estados não pesquisados nesta fase** (AL, SE, PB, RN, PI, MA,
  AM, AC, RR, AP).

### 21.1 Recomendação de ordem de implementação (Fase 35)

1. **ANTT — provider de tarifas por concessão** (Prioridade 1, maior
   cobertura geográfica por esforço de implementação — um único crawler
   cobre concessões em pelo menos 20 estados diferentes).
2. **RJ — AGETRANSP** (Prioridade 1, fonte mais completa e simples
   encontrada — bom "segundo provider" para validar que a arquitetura
   generaliza além do formato KMZ da ANTT).
3. Reavaliar prioridade 2/3 (PE, MS, SP, MG) somente após 1 e 2 estarem
   implementados e estáveis.

