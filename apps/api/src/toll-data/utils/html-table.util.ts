import { normalizeWhitespace } from './brazilian-format.util';

// Fase 35/36 -- extracao generica de tabelas HTML por regex, reaproveitada
// por qualquer parser de fonte oficial que publique dado em <table> (ANTT
// por concessao, RJ/AGETRANSP) -- nunca reimplementada por provider. Nao
// depende de nenhuma estrutura de DOM real (nem jsdom/cheerio) -- so
// regex, suficiente para HTML servidor-renderizado simples/moderadamente
// aninhado (nunca para paginas que dependem de JS para montar a tabela).
export function extractRows(tableHtml: string): string[] {
  const matches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
  return matches ?? [];
}

// Fase "Expansao ANTT" -- algumas concessoes publicam cabecalho em HTML
// semantico real (<th scope="col">), nao so a sopa de <td> gerada por
// exportacao do Word -- confirmado por download real (Via 040 e outras).
// <th> e <td> tem o mesmo significado de "celula" para efeito de extracao
// de texto; aceitar os dois nunca muda o resultado de paginas que so usam
// <td> (RJ_AGETRANSP, que ja usa <th> no cabecalho mas descarta essa linha
// via rows.slice(1) sem nunca ler o conteudo dela).
export function extractCells(rowHtml: string): string[] {
  const matches = rowHtml.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? [];
  return matches.map((cell) => cellText(cell));
}

export function cellText(cellHtml: string): string {
  const withoutTags = cellHtml.replace(/<[^>]*>/g, ' ');
  const decoded = withoutTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return normalizeWhitespace(decoded);
}

// Extrai o PRIMEIRO <table>...</table> cujo conteudo contem TODOS os
// marcadores esperados -- nunca assume que e a primeira tabela da pagina
// (paginas institucionais tem outras tabelas/menus antes do conteudo real).
export function extractTableContaining(html: string, mustContain: string[]): string | null {
  const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/g);
  if (!tables) return null;
  return tables.find((table) => mustContain.every((marker) => table.includes(marker))) ?? null;
}
