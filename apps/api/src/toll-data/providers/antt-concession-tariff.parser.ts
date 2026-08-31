import { findAmbiguousAxleCounts } from '../utils/axle-category-ambiguity.util';
import { parseBrazilianDecimal } from '../utils/brazilian-format.util';
import { extractCells, extractRows, extractTableContaining } from '../utils/html-table.util';

// Fase 35 -- parser da fonte descoberta na Fase 34: gov.br/antt publica,
// para cada concessao rodoviaria federal, DUAS paginas HTML irmas sob
// .../lista-de-concessoes/{slug}/revisoes-e-reajustes/:
//   - tarifas-de-pedagio: tabela Categoria/Tipo de Veiculo/Numero de
//     Eixos/Rodagem/Multiplicador + 1 coluna de valor (R$) por praca
//     (P1..Pn), SEM identificar rodovia/km/municipio de cada praca.
//   - localizacao-das-pracas-de-pedagio: tabela Praca/Rodovia/UF/Km/
//     Municipio/Tipo de Pista/Sentido/Latitude/Longitude por praca (P1..Pn),
//     SEM nenhum valor de tarifa.
// Nenhuma das duas paginas sozinha identifica uma TollPlaza com seguranca
// -- precisam ser combinadas pelo rotulo comum (P1, P2...). Estrutura
// confirmada por download real (curl) da pagina "Via Cristais" em
// 10/08/2026 -- HTML gerado por exportacao do Word (classes "SCXW...",
// muito ruido de <span>/<div> aninhados), NUNCA limpo/semantico.

export interface AnttConcessionTariffRow {
  // Fase "Expansao ANTT" -- null quando a concessao publica UM valor unico
  // por categoria (nunca uma coluna por praca) -- ver comentario acima de
  // parseAnttConcessionTariffTable. Mesmo significado de
  // NormalizedTollTariff.km === null (RJ_AGETRANSP): a tarifa vale para
  // TODAS as pracas conhecidas da concessionaria, nunca so uma.
  plazaLabel: string | null; // "P1"
  category: number; // "Categoria" da ANTT (1..N) -- so para rastreabilidade, nao e usado como chave.
  vehicleType: string;
  axleCount: number | null;
  wheelType: string | null; // "Simples" | "Dupla" (Rodagem)
  tariffMultiplier: number | null;
  price: number | null;
}

export interface AnttConcessionPlazaLocation {
  plazaLabel: string; // "P1"
  plazaName: string; // texto apos o traco/en-dash: "PARACATU"
  highway: string | null;
  state: string | null;
  km: number | null;
  city: string | null;
  laneType: string | null;
  direction: string | null;
  latitude: number | null;
  longitude: number | null;
}

// Registro final, ja combinando as duas paginas -- pronto para o matching
// (toll-plaza-matching.util.ts) e para virar TollRate. axleCategory ja no
// formato usado por TollRatesService ("9 eixos") -- nunca reinterpretado
// depois disso.
export interface NormalizedAnttConcessionTariff {
  plazaLabel: string | null;
  highway: string | null;
  km: number | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  axleCategory: string; // "${axleCount} eixos"
  price: number;
  currency: 'BRL';
}

// Fase 35, secao 7/8 -- se a tabela de tarifas nao tiver a estrutura
// esperada (marcadores ausentes, cabecalho de pracas vazio, linhas sem o
// numero certo de colunas), retorna [] em vez de adivinhar qualquer
// coisa. O chamador (provider) trata lista vazia como estrutura invalida
// -> FAILED, nunca como "sem tarifas".
// Fase "Expansao ANTT" -- verificacao real (download ao vivo, nao so a
// fixture da Fase 35) revelou que a 2a linha do cabecalho NEM SEMPRE usa
// "P1".."Pn" abreviado: Via Cristais e outras concessoes publicam "Praça
// 1".."Praça n" por extenso (confirmado no download real -- a fixture
// gravada na Fase 35 capturou o formato abreviado, o formato por extenso
// tambem e real, nao inventado). A pagina de LOCALIZACAO das mesmas
// concessoes continua publicando sempre "P1 – Cidade" abreviado -- por
// isso o rotulo aqui e sempre NORMALIZADO para "P{n}" antes de ser usado
// (e o formato que normalizeAnttConcessionTariffs precisa para combinar
// com a pagina de localizacao). Aceita variacoes de acento/maiuscula
// ("Praca"/"Praça"/"PRAÇA") e espaco entre a palavra e o numero.
// Fase "Expansao ANTT" -- alem do formato "P1"/"Praça 1", a verificacao
// real tambem encontrou a pagina de TARIFAS usando numero sem zero a
// esquerda ("P1") enquanto a pagina IRMA de LOCALIZACAO da MESMA concessao
// usa zero a esquerda ("P01") -- confirmado em Autopista Fluminense. Sem
// normalizar os dois para a MESMA forma canonica, normalizeAnttConcessionTariffs
// nunca encontraria a localizacao correspondente (comparacao de string
// exata) e rejeitaria a concessao inteira por engano. parseInt() descarta
// zero a esquerda naturalmente -- nunca reformatado "na marra".
function canonicalPlazaLabel(plazaNumber: string): string {
  return `P${parseInt(plazaNumber, 10)}`;
}

function normalizePlazaHeaderLabel(cell: string): string | null {
  const trimmed = cell.trim();
  const short = /^P\s*(\d+)$/i.exec(trimmed);
  if (short) return canonicalPlazaLabel(short[1]!);
  const long = /^Pra[cç]a\s*(\d+)$/i.exec(trimmed);
  if (long) return canonicalPlazaLabel(long[1]!);
  return null;
}

// Fase "Expansao ANTT" -- linha de dado padrao: 4 ou 5 colunas fixas
// (Categoria, Tipo, Eixos, [Rodagem], Multiplicador) + N valores (1 por
// praca, ou so 1 no modo uniforme). A coluna "Rodagem" (Simples/Dupla) NAO
// existe em todas as concessoes -- confirmado por download real (Rodovia
// do Aço nao publica essa coluna). `hasWheelType` vem do CABECALHO real
// (nunca presumido por contagem de coluna sozinha -- ver
// detectHasWheelTypeColumn) para decidir o deslocamento correto de
// Multiplicador/Valores. Reaproveitada pelos 2 modos abaixo -- nunca duas
// implementacoes de parsing de linha.
function parseTariffDataRow(
  cells: string[],
  hasWheelType: boolean,
): { category: number; vehicleType: string; axleCount: number | null; wheelType: string | null; tariffMultiplier: number | null } | null {
  const category = parseInt(cells[0]!, 10);
  const vehicleType = cells[1]!;
  if (!Number.isFinite(category) || !vehicleType) return null;
  const axleCount = parseInt(cells[2]!, 10);
  const multiplierIndex = hasWheelType ? 4 : 3;
  return {
    category,
    vehicleType,
    axleCount: Number.isFinite(axleCount) ? axleCount : null,
    wheelType: hasWheelType ? cells[3] || null : null,
    tariffMultiplier: parseBrazilianDecimal(cells[multiplierIndex]),
  };
}

// Confirma pelo PROPRIO cabecalho (nunca adivinhado por contagem de coluna
// isolada) se esta concessao publica a coluna "Rodagem".
function detectHasWheelTypeColumn(headerRowCells: string[]): boolean {
  return headerRowCells.some((cell) => /rodagem/i.test(cell));
}

// Fase "Recuperacao ANTT" -- verificacao real (Ecosul, contrato encerrado)
// revelou uma 3a variante de tabela de tarifa: SEM coluna "Multiplicador"
// -- o valor final (R$) ja vem pronto na ultima coluna fixa (Categoria/
// Tipo/Eixos/[Rodagem]/Valor), confirmado por download real (exatamente 5
// colunas, cabecalho "Valores a serem Praticados (R$)", nenhuma coluna
// extra por praca). Sempre tratada como modo UNIFORME (mesma tarifa para
// todas as pracas conhecidas da concessionaria) -- essa variante nunca traz
// rotulo de praca em nenhuma linha nas fontes confirmadas, entao nunca
// e forcado um modo multi-praca aqui.
function parseDirectValueTariffRow(
  cells: string[],
  hasWheelType: boolean,
): { category: number; vehicleType: string; axleCount: number | null; wheelType: string | null; price: number | null } | null {
  const category = parseInt(cells[0]!, 10);
  const vehicleType = cells[1]!;
  if (!Number.isFinite(category) || !vehicleType) return null;
  const axleCount = parseInt(cells[2]!, 10);
  const priceIndex = hasWheelType ? 4 : 3;
  return {
    category,
    vehicleType,
    axleCount: Number.isFinite(axleCount) ? axleCount : null,
    wheelType: hasWheelType ? cells[3] || null : null,
    price: parseBrazilianDecimal(cells[priceIndex]),
  };
}

function parseDirectValueTariffTable(table: string): AnttConcessionTariffRow[] {
  const rows = extractRows(table);
  if (rows.length < 2) return [];

  const headerRowIndex = rows.findIndex((row) => extractCells(row).some((cell) => /categoria/i.test(cell)));
  if (headerRowIndex === -1) return [];

  const hasWheelType = detectHasWheelTypeColumn(extractCells(rows[headerRowIndex]!));
  const fixedColumns = hasWheelType ? 5 : 4;

  const results: AnttConcessionTariffRow[] = [];
  for (const row of rows.slice(headerRowIndex + 1)) {
    const cells = extractCells(row);
    if (cells.length !== fixedColumns) continue; // nunca alinhado "na marra".
    const parsed = parseDirectValueTariffRow(cells, hasWheelType);
    if (!parsed) continue;
    results.push({ ...parsed, plazaLabel: null, tariffMultiplier: null });
  }
  return results;
}

function parseMultiplierTariffTable(table: string): AnttConcessionTariffRow[] {
  const rows = extractRows(table);
  if (rows.length < 2) return []; // precisa de >=1 linha de cabecalho + >=1 linha de dado.

  // Fase "Expansao ANTT" -- verificacao real revelou que a linha de
  // cabecalho ("Categoria de Veículo"...) NEM SEMPRE e rows[0]: varias
  // concessoes (Ecovias do Cerrado, Motiva Minas SP, Transbrasiliana, Via
  // Bahia, Nova 364, entre outras) publicam uma linha de TITULO/LEGENDA
  // antes (ex: "TARIFAS", "Praças de Pedágio: P1, P2...", ou celulas
  // vazias de span) -- confirmado byte-a-byte. Localizar a linha real pelo
  // proprio conteudo ("Categoria" -- o mesmo marcador ja usado para achar
  // a tabela) e sempre mais seguro que presumir um indice fixo.
  const headerRowIndex = rows.findIndex((row) => extractCells(row).some((cell) => /categoria/i.test(cell)));
  if (headerRowIndex === -1) return [];

  // Determina o numero de colunas FIXAS (4 ou 5) a partir do cabecalho
  // real -- Rodovia do Aço, entre outras, NAO publica a coluna "Rodagem"
  // (Simples/Dupla). Nunca presumido.
  const hasWheelType = detectHasWheelTypeColumn(extractCells(rows[headerRowIndex]!));
  const fixedColumns = hasWheelType ? 5 : 4;

  // Linha SEGUINTE ao cabecalho = rotulos de praca ("P1"/"Praça 1"..Pn), na
  // mesma ordem das colunas de valor de cada linha de dado. Celulas que
  // nao sao rotulo de praca reconhecivel (nenhuma delas, nas fontes
  // confirmadas) nunca entram -- nunca alinhado "na marra" com um indice
  // adivinhado.
  const plazaLabelRowIndex = headerRowIndex + 1;
  const headerCells = rows.length > plazaLabelRowIndex ? extractCells(rows[plazaLabelRowIndex]!) : [];
  const plazaLabels = headerCells.map(normalizePlazaHeaderLabel).filter((label): label is string => label !== null);

  if (plazaLabels.length > 0 && plazaLabels.length === headerCells.length) {
    const results: AnttConcessionTariffRow[] = [];
    for (const row of rows.slice(plazaLabelRowIndex + 1)) {
      const cells = extractCells(row);
      // Colunas fixas + 1 valor por praca. Linha com contagem diferente =
      // fora do padrao esperado -- ignorada, nunca alinhada "na marra".
      if (cells.length !== fixedColumns + plazaLabels.length) continue;
      const parsed = parseTariffDataRow(cells, hasWheelType);
      if (!parsed) continue;

      const prices = cells.slice(fixedColumns);
      plazaLabels.forEach((plazaLabel, index) => {
        results.push({ ...parsed, plazaLabel: plazaLabel.toUpperCase(), price: parseBrazilianDecimal(prices[index]) });
      });
    }
    return results;
  }

  // Fase "Expansao ANTT" -- verificacao real revelou concessoes (ex: Via
  // 040, Autopista Régis Bittencourt) que publicam a MESMA tarifa para
  // TODAS as pracas da concessionaria -- sem coluna por praca, so 1 valor
  // por categoria (mesmo modelo ja usado por RJ_AGETRANSP). Distinguido do
  // modo multi-praca acima por NAO ter rotulos de praca reconheciveis na
  // linha seguinte ao cabecalho (que, neste modo, ja e a 1a linha de
  // DADO, nunca cabecalho de praca). Formato real confirmado com
  // cabecalho em <th> (HTML semantico) em algumas paginas e <td>
  // (exportacao do Word) em outras -- ambos ja suportados por extractCells.
  const results: AnttConcessionTariffRow[] = [];
  for (const row of rows.slice(headerRowIndex + 1)) {
    const cells = extractCells(row);
    if (cells.length !== fixedColumns + 1) continue; // colunas fixas + 1 valor unico -- nunca alinhado "na marra".
    const parsed = parseTariffDataRow(cells, hasWheelType);
    if (!parsed) continue;
    results.push({ ...parsed, plazaLabel: null, price: parseBrazilianDecimal(cells[fixedColumns]) });
  }
  return results;
}

// Fase "Recuperacao ANTT" -- tenta primeiro o formato padrao (com
// Multiplicador, a grande maioria das concessoes confirmadas ate aqui);
// so tenta o formato de valor direto (Ecosul) quando o padrao NAO for
// encontrado -- nunca compete com o formato ja confirmado, nunca risco de
// uma fonte com Multiplicador ser mal interpretada pelo caminho novo.
export function parseAnttConcessionTariffTable(html: string): AnttConcessionTariffRow[] {
  const multiplierTable = extractTableContaining(html, ['Categoria', 'Multiplicador']);
  if (multiplierTable) return parseMultiplierTariffTable(multiplierTable);

  const directValueTable = extractTableContaining(html, ['Categoria', 'Valores a serem Praticados']);
  if (directValueTable) return parseDirectValueTariffTable(directValueTable);

  return [];
}

export function parseAnttConcessionPlazaLocations(html: string): AnttConcessionPlazaLocation[] {
  const table = extractTableContaining(html, ['RODOVIA', 'MUNIC']);
  if (!table) return [];

  const rows = extractRows(table);
  if (rows.length < 2) return [];

  const results: AnttConcessionPlazaLocation[] = [];
  // Separador entre rotulo e nome da praca varia por concessao (verificacao
  // real, Fase "Expansao ANTT"): en-dash (–, a maioria), hifen comum (-),
  // ou NENHUM separador, so espaco (ex: Concebra: "P1 ALEXÂNIA"). O
  // separador em si (quando existe) e opcional no regex -- nunca torna a
  // celula inteira nao-reconhecivel so por causa de pontuacao. Numero com
  // ou sem zero a esquerda ("P1" ou "P01") -- ver canonicalPlazaLabel,
  // mesma normalizacao usada do lado da tabela de tarifas, para que as
  // duas paginas sempre combinem pelo mesmo rotulo.
  const labelPattern = /^P\s*(\d+)\s*[–-]?\s*(.+)$/i;

  for (const row of rows.slice(1)) {
    const cells = extractCells(row);
    if (cells.length !== 9) continue; // fora do padrao esperado -- ignorada.

    const labelMatch = labelPattern.exec(cells[0]!);
    if (!labelMatch) continue; // sem rotulo Pn identificavel -- nunca adivinhado.

    results.push({
      plazaLabel: canonicalPlazaLabel(labelMatch[1]!),
      plazaName: labelMatch[2]!.trim(),
      highway: cells[1] || null,
      state: cells[2] || null,
      km: parseBrazilianDecimal(cells[3]),
      city: cells[4] || null,
      laneType: cells[5] || null,
      direction: cells[6] || null,
      latitude: parseBrazilianDecimal(cells[7]),
      longitude: parseBrazilianDecimal(cells[8]),
    });
  }

  return results;
}

// Combina as duas paginas (secao 8/9 da fase). Regra critica (secao 9):
// quando o MESMO numero de eixos aparece em mais de uma categoria da
// mesma tabela (ex: "2 eixos simples" = carros vs "2 eixos dupla" =
// caminhao leve -- valores DIFERENTES), axleCategory (`"${eixos} eixos"`)
// sozinho nao identifica qual valor vale -- nunca decide por adivinhacao
// qual das duas categorias "e a certa". Eixos ambiguos sao excluidos
// inteiramente (nunca uma tarifa de categoria errada aplicada a um
// caminhao). Isso nunca afeta o caso de uso real desta fase (caminhoes de
// 7/9 eixos), onde cada numero de eixos aparece em exatamente 1 categoria
// nas tabelas reais confirmadas.
export function normalizeAnttConcessionTariffs(
  tariffHtml: string,
  locationsHtml: string,
): NormalizedAnttConcessionTariff[] {
  const tariffRows = parseAnttConcessionTariffTable(tariffHtml);
  const locations = parseAnttConcessionPlazaLocations(locationsHtml);
  const locationByLabel = new Map(locations.map((loc) => [loc.plazaLabel, loc]));

  const ambiguousAxleCounts = findAmbiguousAxleCounts(
    tariffRows.map((row) => ({ axleCount: row.axleCount, groupKey: String(row.category) })),
  );

  const results: NormalizedAnttConcessionTariff[] = [];
  for (const row of tariffRows) {
    if (row.axleCount === null || row.price === null) continue;
    if (ambiguousAxleCounts.has(row.axleCount)) continue;

    // Fase "Expansao ANTT" -- modo uniforme (row.plazaLabel === null, ver
    // parseAnttConcessionTariffTable): a tarifa nao e de UMA praca
    // especifica, entao nunca ha localizacao para combinar -- highway/km/
    // city/lat/long ficam null de proposito (mesmo significado ja usado
    // por RJ_AGETRANSP: TollDataSyncService.applyTariffs aplica a MESMA
    // tarifa a TODAS as pracas ja conhecidas da concessionaria quando
    // km === null, nunca escolhendo "uma" entre varias).
    if (row.plazaLabel === null) {
      results.push({
        plazaLabel: null,
        highway: null,
        km: null,
        city: null,
        latitude: null,
        longitude: null,
        axleCategory: `${row.axleCount} eixos`,
        price: row.price,
        currency: 'BRL',
      });
      continue;
    }

    const location = locationByLabel.get(row.plazaLabel);
    if (!location) continue; // praca sem localizacao correspondente -- nunca inventada.

    results.push({
      plazaLabel: row.plazaLabel,
      highway: location.highway,
      km: location.km,
      city: location.city,
      latitude: location.latitude,
      longitude: location.longitude,
      axleCategory: `${row.axleCount} eixos`,
      price: row.price,
      currency: 'BRL',
    });
  }

  return results;
}
