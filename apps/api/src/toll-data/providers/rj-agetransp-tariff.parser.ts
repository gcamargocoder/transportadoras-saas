import { findAmbiguousAxleCounts } from '../utils/axle-category-ambiguity.util';
import { parseBrazilianDecimal } from '../utils/brazilian-format.util';
import { extractCells, extractRows, extractTableContaining } from '../utils/html-table.util';

// Fase 36 -- parser da fonte confirmada na Fase 34 e REVALIDADA (download
// real via curl em 10/08/2026) nesta fase: agetransp.rj.gov.br publica,
// para cada concessao rodoviaria estadual do RJ, uma pagina propria
// (.../concessionarias/{slug}) com UMA tabela de tarifas por
// categoria/eixos -- diferente da ANTT, a tarifa AGETRANSP e UNICA por
// concessao (nao varia por praca dentro da mesma concessao: a tabela nao
// tem coluna por praca, so "DIAS UTEIS"/"SAB. DOM. E FERIADOS"), e a
// pagina TAMBEM publica a vigencia legal explicita ("Cobranca praticada a
// partir de DD/MM/AAAA") e o link/numero da Deliberacao que a homologou --
// informacao que a ANTT nao fornece (ver antt-concession-tariff.parser.ts).
// HTML server-renderizado (Laravel/Livewire), sem necessidade de executar
// JS -- confirmado real em "Via Lagos" e "Rota 116".

export interface RjAgetranspTariffRow {
  vehicleType: string;
  axleCount: number | null;
  wheelType: string | null; // "simples" | "dupla"
  tariffMultiplier: number | null;
  /// Tarifa em dias uteis -- usada como valor canonico (ver normalizeRj
  /// AgetranspTariffs). A tarifa de fim de semana/feriado existe na fonte
  /// mas NAO tem campo correspondente no modelo TollRate atual -- nunca
  /// inventado um campo novo so para isso nesta fase (ver relatorio).
  weekdayPrice: number | null;
}

export interface RjAgetranspVigencia {
  /// Data de vigencia legal real publicada pela fonte -- nunca a data de
  /// coleta (diferente de ANTT_TARIFAS, que nao tem essa informacao).
  effectiveFrom: Date | null;
  deliberationNumber: string | null;
  deliberationUrl: string | null;
}

export interface NormalizedRjAgetranspTariff {
  axleCategory: string; // "${axleCount} eixos"
  price: number;
  currency: 'BRL';
  effectiveFrom: Date | null;
  sourceDocument: string | null;
  sourceReference: string | null;
}

// "2 eixos simples" | "3 eixos dupla" -- diferente da ANTT, que publica
// eixos e rodagem em colunas separadas.
const AXLE_CELL_PATTERN = /^(\d+)\s*eixos?\s*(\S+)?/i;

export function parseRjAgetranspTariffTable(html: string): RjAgetranspTariffRow[] {
  const table = extractTableContaining(html, ['EIXOS', 'MULT']);
  if (!table) return [];

  const rows = extractRows(table);
  if (rows.length < 2) return []; // precisa de >=1 cabecalho + >=1 linha de dado.

  const results: RjAgetranspTariffRow[] = [];
  for (const row of rows.slice(1)) {
    const cells = extractCells(row);
    // VEICULO | EIXOS | MULT. TARIFA | DIAS UTEIS | [SAB. DOM. E FERIADOS] --
    // a ultima coluna e opcional em algumas paginas; aceita 4 ou 5.
    if (cells.length !== 4 && cells.length !== 5) continue;

    const axleMatch = AXLE_CELL_PATTERN.exec(cells[1] ?? '');
    if (!axleMatch) continue; // celula de eixos fora do padrao esperado -- linha ignorada, nunca adivinhada.

    results.push({
      vehicleType: cells[0] ?? '',
      axleCount: parseInt(axleMatch[1]!, 10),
      wheelType: axleMatch[2] ? axleMatch[2].toLowerCase() : null,
      tariffMultiplier: parseBrazilianDecimal(cells[2]),
      weekdayPrice: parseBrlCurrency(cells[3]),
    });
  }
  return results;
}

function parseBrlCurrency(text: string | undefined): number | null {
  if (!text) return null;
  return parseBrazilianDecimal(text.replace(/R\$\s*/gi, ''));
}

// "Cobranca praticada a partir de 01/08/2025." -- texto simples entre
// <br>, fora de qualquer tabela; nunca depende da frase "Deliberacao N.
// ... de 29 de July de 2025" (mistura PT/EN de mes visto na fonte real --
// fragil demais para interpretar como data). O numero da deliberacao vem
// do PROPRIO link (.../deliberacoes/numero/{n}/visualizar), nunca do texto
// visivel.
export function parseRjAgetranspVigencia(html: string): RjAgetranspVigencia {
  const dateMatch = /Cobran[çc]a praticada a partir de\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(html);
  const effectiveFrom = dateMatch
    ? new Date(Date.UTC(Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1])))
    : null;

  const deliberationMatch = /href="([^"]*\/deliberacoes\/numero\/(\d+)\/visualizar)"/i.exec(html);
  const deliberationUrl = deliberationMatch ? deliberationMatch[1]! : null;
  const deliberationNumber = deliberationMatch ? deliberationMatch[2]! : null;

  return { effectiveFrom, deliberationNumber, deliberationUrl };
}

// Combina tabela + vigencia (mesma regra de ambiguidade de eixos da ANTT,
// reaproveitada via findAmbiguousAxleCounts -- nunca um algoritmo
// paralelo). Diferente da ANTT, nao ha "praca" nesta fonte -- o
// TollDataSyncService aplica esta MESMA tarifa a todas as pracas
// conhecidas da concessionaria (ver applyTariffs(), secao de matching).
export function normalizeRjAgetranspTariffs(html: string): NormalizedRjAgetranspTariff[] {
  const rows = parseRjAgetranspTariffTable(html);
  const vigencia = parseRjAgetranspVigencia(html);

  // groupKey = tipo de veiculo (nunca so a rodagem): a fonte RJ tem MAIS de
  // uma categoria de veiculo para a mesma rodagem no mesmo numero de eixos
  // (ex: "2 eixos simples" cobre tanto motocicleta -- R$9,20 -- quanto
  // automovel -- R$18,40 -- com precos DIFERENTES) -- usar so a rodagem
  // como chave deixaria essa colisao passar despercebida.
  const ambiguousAxleCounts = findAmbiguousAxleCounts(
    rows.map((row) => ({ axleCount: row.axleCount, groupKey: row.vehicleType })),
  );

  const sourceDocument = vigencia.deliberationNumber ? `Deliberacao AGETRANSP no. ${vigencia.deliberationNumber}` : null;

  const results: NormalizedRjAgetranspTariff[] = [];
  for (const row of rows) {
    if (row.axleCount === null || row.weekdayPrice === null) continue;
    if (ambiguousAxleCounts.has(row.axleCount)) continue;

    results.push({
      axleCategory: `${row.axleCount} eixos`,
      price: row.weekdayPrice,
      currency: 'BRL',
      effectiveFrom: vigencia.effectiveFrom,
      sourceDocument,
      sourceReference: vigencia.deliberationUrl,
    });
  }
  return results;
}
