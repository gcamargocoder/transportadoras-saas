import { FiscalDocumentType } from '@prisma/client';

// Fase 55/58 -- relacionamento MDF-e <-> CT-e/NF-e, SOMENTE derivado das
// chaves ja declaradas pelo proprio XML na importacao (<chNFe>/<chCTe>,
// extraidas em fiscal-xml.parser.ts e gravadas em
// metadata.manifestedAccessKeys) -- NUNCA por aproximacao de numero, data
// ou valor. Compartilhado entre o detalhe (computeRelatedDocuments, 1
// documento) e a matriz/dashboard (em lote, sobre dados ja carregados).
export function extractManifestedAccessKeys(metadata: unknown): string[] | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).manifestedAccessKeys;
  if (!Array.isArray(value)) return null;
  const keys = value.filter((entry): entry is string => typeof entry === 'string');
  return keys.length > 0 ? keys : null;
}

export interface RelationshipDocumentInput {
  id: string;
  documentType: FiscalDocumentType;
  accessKey: string | null;
  metadata: unknown;
}

// Fase 58 -- calcula, EM LOTE e em memoria, quais documentos (dentre os
// fornecidos) participam de um relacionamento manifesto: um MDF-e cujo
// metadata.manifestedAccessKeys contem a accessKey de outro documento
// TAMBEM presente no mesmo lote. So conta como relacionamento "real" (e
// entra no Set) quando as DUAS pontas estao no lote -- nunca infere uma
// relacao com um documento que o chamador nao carregou. Usado pela matriz
// da viagem (lote = documentos da viagem) e pelo dashboard (lote =
// classificationRows, ja carregado, zero queries novas).
export function buildRelatedDocumentIdSet(documents: RelationshipDocumentInput[]): Set<string> {
  const accessKeyToId = new Map<string, string>();
  for (const doc of documents) {
    if (doc.accessKey) accessKeyToId.set(doc.accessKey, doc.id);
  }

  const related = new Set<string>();
  for (const doc of documents) {
    if (doc.documentType !== FiscalDocumentType.MDFE) continue;
    const manifestedAccessKeys = extractManifestedAccessKeys(doc.metadata);
    if (!manifestedAccessKeys) continue;
    for (const key of manifestedAccessKeys) {
      const targetId = accessKeyToId.get(key);
      if (targetId) {
        related.add(doc.id);
        related.add(targetId);
      }
    }
  }
  return related;
}
