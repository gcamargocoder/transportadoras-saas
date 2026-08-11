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
  plazaLabel: string; // "P1"
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
  plazaLabel: string;
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
export function parseAnttConcessionTariffTable(html: string): AnttConcessionTariffRow[] {
  const table = extractTableContaining(html, ['Categoria', 'Multiplicador']);
  if (!table) return [];

  const rows = extractRows(table);
  if (rows.length < 3) return []; // precisa de 2 linhas de cabecalho + >=1 linha de dado.

  // 2a linha do cabecalho = rotulos de praca (P1..Pn), na mesma ordem das
  // colunas de valor de cada linha de dado.
  const plazaLabels = extractCells(rows[1]!).filter((cell) => /^P\d+$/i.test(cell));
  if (plazaLabels.length === 0) return [];

  const results: AnttConcessionTariffRow[] = [];
  for (const row of rows.slice(2)) {
    const cells = extractCells(row);
    // 5 colunas fixas (Categoria, Tipo, Eixos, Rodagem, Multiplicador) + 1
    // valor por praca. Linha com contagem diferente = fora do padrao
    // esperado -- ignorada, nunca alinhada "na marra".
    if (cells.length !== 5 + plazaLabels.length) continue;

    const category = parseInt(cells[0]!, 10);
    const vehicleType = cells[1]!;
    const axleCount = parseInt(cells[2]!, 10);
    const wheelType = cells[3] || null;
    const tariffMultiplier = parseBrazilianDecimal(cells[4]);
    if (!Number.isFinite(category) || !vehicleType) continue;

    const prices = cells.slice(5);
    plazaLabels.forEach((plazaLabel, index) => {
      results.push({
        plazaLabel: plazaLabel.toUpperCase(),
        category,
        vehicleType,
        axleCount: Number.isFinite(axleCount) ? axleCount : null,
        wheelType,
        tariffMultiplier,
        price: parseBrazilianDecimal(prices[index]),
      });
    });
  }

  return results;
}

export function parseAnttConcessionPlazaLocations(html: string): AnttConcessionPlazaLocation[] {
  const table = extractTableContaining(html, ['RODOVIA', 'MUNIC']);
  if (!table) return [];

  const rows = extractRows(table);
  if (rows.length < 2) return [];

  const results: AnttConcessionPlazaLocation[] = [];
  // Aceita tanto en-dash (–, como publicado na maioria das pracas) quanto
  // hifen comum (-, visto em pelo menos uma praca da mesma tabela real) --
  // inconsistencia confirmada na propria fonte, nunca assumida uniforme.
  const labelPattern = /^(P\d+)\s*[–-]\s*(.+)$/i;

  for (const row of rows.slice(1)) {
    const cells = extractCells(row);
    if (cells.length !== 9) continue; // fora do padrao esperado -- ignorada.

    const labelMatch = labelPattern.exec(cells[0]!);
    if (!labelMatch) continue; // sem rotulo Pn identificavel -- nunca adivinhado.

    results.push({
      plazaLabel: labelMatch[1]!.toUpperCase(),
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
