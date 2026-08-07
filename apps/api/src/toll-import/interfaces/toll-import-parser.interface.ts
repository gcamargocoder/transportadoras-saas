// Linha crua, exatamente como veio do arquivo (chave = cabecalho da coluna,
// valor = celula, ambos como string). A normalizacao para os campos
// canonicos (tag/praca/dataHora/valor/eixos) acontece depois, em
// utils/toll-import-header.util.ts -- o parser so sabe ler o formato do
// arquivo, nunca conhece as regras de negocio do pedagio.
export type RawImportRow = Record<string, string>;

// Contrato unico que qualquer formato de extrato deve implementar. Novos
// formatos (XML, TXT, integracao direta com API da operadora) se conectam
// aqui sem exigir mudanca em TollImportService -- so um novo parser +
// entrada no factory (ver parsers/toll-import-parser.factory.ts).
export interface TollImportParser {
  parse(buffer: Buffer): Promise<RawImportRow[]>;
}
