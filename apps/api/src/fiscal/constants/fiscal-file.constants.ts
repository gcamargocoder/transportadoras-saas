import { ValidatedFileKind } from '../../common/utils/file-signature.util';

// Fase 52, secao 3 -- unico ponto que decide quais extensoes o upload/
// importacao de documento fiscal aceita. Extensao (ja filtrada aqui pelo
// multer) nunca prova o conteudo real -- ver
// fiscal-document-storage.config.ts (fileFilter) + assertValidFileSignature
// (conferencia da assinatura binaria real do arquivo salvo em disco).
export const EXTENSION_TO_FILE_SIGNATURE_KIND: Record<string, ValidatedFileKind> = {
  '.pdf': 'PDF',
  '.xml': 'XML',
  '.jpg': 'JPEG',
  '.jpeg': 'JPEG',
  '.png': 'PNG',
};

export const ALLOWED_FISCAL_DOCUMENT_EXTENSIONS = Object.keys(EXTENSION_TO_FILE_SIGNATURE_KIND);

// POST /fiscal/documents/import so aceita XML (e o formato com parser).
export const ALLOWED_FISCAL_XML_EXTENSIONS = ['.xml'];
