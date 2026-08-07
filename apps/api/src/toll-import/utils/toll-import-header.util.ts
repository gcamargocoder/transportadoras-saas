import { RawImportRow } from '../interfaces/toll-import-parser.interface';

// Colunas esperadas no extrato (CSV/XLSX): tag, praca, dataHora, valor,
// eixos. Cada operadora nomeia essas colunas de um jeito -- normalizamos o
// cabecalho (minusculo, sem acento/espaco/pontuacao) e casamos contra uma
// lista de apelidos conhecidos, para nao depender de um layout exato.
export type CanonicalTollImportField = 'tag' | 'praca' | 'dataHora' | 'valor' | 'eixos';

export const CANONICAL_TOLL_IMPORT_FIELDS: CanonicalTollImportField[] = [
  'tag',
  'praca',
  'dataHora',
  'valor',
  'eixos',
];

const HEADER_ALIASES: Record<CanonicalTollImportField, string[]> = {
  tag: ['tag', 'numerotag', 'numerodatag', 'tagnumero', 'codigotag'],
  praca: ['praca', 'pracapedagio', 'nomepraca', 'localcobranca'],
  dataHora: ['datahora', 'data', 'datacobranca', 'dataehora', 'datahoracobranca'],
  valor: ['valor', 'valorcobrado', 'valortransacao', 'valorpago'],
  eixos: ['eixos', 'qtdeixos', 'quantidadeeixos', 'numeroeixos', 'qtdeeixos'],
};

function normalizeHeader(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

export function mapRowToCanonicalFields(
  row: RawImportRow,
): Record<CanonicalTollImportField, string | undefined> {
  const normalizedEntries = Object.entries(row).map(
    ([key, value]) => [normalizeHeader(key), value] as const,
  );

  const result = {} as Record<CanonicalTollImportField, string | undefined>;
  for (const field of CANONICAL_TOLL_IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field];
    const match = normalizedEntries.find(([key]) => aliases.includes(key));
    result[field] = match?.[1];
  }
  return result;
}
