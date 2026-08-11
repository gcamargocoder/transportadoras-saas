import { NormalizedTollPlaza } from '../interfaces/normalized-toll-plaza.interface';
import { normalizeWhitespace, parseBrazilianDecimal } from '../utils/brazilian-format.util';

// Fase 33 -- adapter ANTT (secao 6): ANTT raw (KML real, ver relatorio da
// fase) -> NormalizedTollPlaza. Estrutura CONFIRMADA em 10/08/2026 baixando
// o resource real do dataset "Praca de Pedagio"
// (https://dados.antt.gov.br/dataset/praca-de-pedagio): cada <Placemark>
// tem uma <description> em CDATA contendo uma tabela HTML "campo/valor" --
// NAO um <ExtendedData>/<SimpleData> XML limpo (a ANTT nao publica assim).
// Campos observados: concession, praca_de_p, ano_do_pnv, rodovia, uf, km_m,
// municipio, tipo_pista, sentido, situacao, data_da_in, latitude, longitude
// -- SEM NENHUM campo de tarifa (ver relatorio final: tarifa nao vem desta
// fonte). Nomes truncados em 10 caracteres (padrao de exportacao de
// shapefile/Esri) -- reproduzidos exatamente como a fonte publica, nunca
// renomeados para "parecer mais limpo" (rastreabilidade).
function extractPlacemarks(kml: string): string[] {
  const matches = kml.match(/<Placemark[^>]*>[\s\S]*?<\/Placemark>/g);
  return matches ?? [];
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? match[1]!.trim() : null;
}

// A description e HTML dentro de CDATA: <tr><td>campo</td><td>valor</td></tr>
// (linhas alternam bgcolor, sem padrao de atributo confiavel) -- extrai
// pares na ordem em que aparecem.
function extractFieldTable(description: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const rowRegex = /<tr[^>]*>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<\/tr>/g;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(description)) !== null) {
    const key = match[1]!.trim();
    const value = match[2]!.trim();
    if (key) fields[key] = value;
  }
  return fields;
}

// Chave deterministica (Fase 33, secao 5): concessionaria + rodovia + km +
// nome da praca normalizados -- nunca so nome, nunca so coordenada. Estavel
// entre sincronizacoes desde que a fonte nao troque esses 4 valores ao
// mesmo tempo (caso em que, corretamente, seria uma praca "nova" do ponto
// de vista de correspondencia determinística).
export function buildAnttSourceKey(fields: {
  concession: string;
  rodovia: string | null;
  km: number | null;
  placaName: string;
}): string {
  const parts = [
    normalizeWhitespace(fields.concession).toUpperCase(),
    fields.rodovia ? normalizeWhitespace(fields.rodovia).toUpperCase() : '',
    fields.km !== null ? fields.km.toFixed(1) : '',
    normalizeWhitespace(fields.placaName).toUpperCase(),
  ];
  return `ANTT:${parts.join('|')}`;
}

export function parseAnttKml(kml: string): NormalizedTollPlaza[] {
  const placemarks = extractPlacemarks(kml);
  const results: NormalizedTollPlaza[] = [];

  for (const block of placemarks) {
    const description = extractTag(block, 'description');
    if (!description) continue; // Placemark sem tabela de campos (ex: pasta-raiz) -- ignorado, nunca inventado.

    const fields = extractFieldTable(description);
    const concession = fields.concession;
    if (!concession) continue; // Sem concessionaria identificavel -- registro rejeitado, nao adivinhado.

    const placaName = fields.praca_de_p ?? '';
    const rodovia = fields.rodovia ?? null;
    const km = parseBrazilianDecimal(fields.km_m);
    const latitude = parseBrazilianDecimal(fields.latitude);
    const longitude = parseBrazilianDecimal(fields.longitude);

    results.push({
      sourceKey: buildAnttSourceKey({ concession, rodovia, km, placaName }),
      // Nome legivel: concessionaria + identificador da praca (a fonte nao
      // publica um "nome" unico de praca separado -- ver campo praca_de_p).
      name: placaName ? `${concession} - ${placaName}` : concession,
      concessionaire: concession,
      highway: rodovia,
      km,
      city: fields.municipio ?? null,
      state: fields.uf ?? null,
      latitude,
      longitude,
      status: fields.situacao ?? null,
      raw: fields,
    });
  }

  return results;
}
