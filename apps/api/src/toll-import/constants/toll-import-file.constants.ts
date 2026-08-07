import { ImportFileType } from '@prisma/client';

// Unico ponto que decide quais extensoes o upload aceita HOJE. XML/TXT/
// API_INTEGRATION ja existem no enum ImportFileType (preparados para o
// futuro), mas so entram aqui quando um parser real for implementado --
// adicionar suporte a um novo formato e so acrescentar uma entrada neste
// mapa + um novo parser (ver parsers/toll-import-parser.factory.ts).
export const EXTENSION_TO_IMPORT_FILE_TYPE: Record<string, ImportFileType> = {
  '.csv': ImportFileType.CSV,
  '.xlsx': ImportFileType.XLSX,
};

export const ALLOWED_TOLL_IMPORT_EXTENSIONS = Object.keys(EXTENSION_TO_IMPORT_FILE_TYPE);
