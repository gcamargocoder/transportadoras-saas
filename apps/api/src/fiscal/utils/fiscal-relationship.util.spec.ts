import { FiscalDocumentType } from '@prisma/client';
import { buildRelatedDocumentIdSet, extractManifestedAccessKeys, RelationshipDocumentInput } from './fiscal-relationship.util';

describe('extractManifestedAccessKeys', () => {
  it('retorna null quando metadata e null/nao-objeto/array', () => {
    expect(extractManifestedAccessKeys(null)).toBeNull();
    expect(extractManifestedAccessKeys(undefined)).toBeNull();
    expect(extractManifestedAccessKeys('string')).toBeNull();
    expect(extractManifestedAccessKeys(['a', 'b'])).toBeNull();
  });

  it('retorna null quando manifestedAccessKeys nao existe ou nao e array', () => {
    expect(extractManifestedAccessKeys({})).toBeNull();
    expect(extractManifestedAccessKeys({ manifestedAccessKeys: 'nao-array' })).toBeNull();
    expect(extractManifestedAccessKeys({ manifestedAccessKeys: [] })).toBeNull();
  });

  it('retorna as chaves quando presentes, filtrando entradas nao-string', () => {
    expect(extractManifestedAccessKeys({ manifestedAccessKeys: ['key-1', 'key-2', 123, null] })).toEqual(['key-1', 'key-2']);
  });
});

describe('buildRelatedDocumentIdSet', () => {
  function doc(overrides: Partial<RelationshipDocumentInput> & Pick<RelationshipDocumentInput, 'id'>): RelationshipDocumentInput {
    return { documentType: FiscalDocumentType.NFE, accessKey: null, metadata: null, ...overrides };
  }

  it('retorna conjunto vazio quando nao ha nenhum MDF-e com manifesto', () => {
    const documents = [doc({ id: 'nfe-1', documentType: FiscalDocumentType.NFE, accessKey: 'key-1' })];
    expect(buildRelatedDocumentIdSet(documents)).toEqual(new Set());
  });

  it('marca AMBAS as pontas (MDF-e e o documento manifestado) quando a chave manifestada esta no mesmo lote', () => {
    const documents = [
      doc({ id: 'mdfe-1', documentType: FiscalDocumentType.MDFE, metadata: { manifestedAccessKeys: ['key-cte-1'] } }),
      doc({ id: 'cte-1', documentType: FiscalDocumentType.CTE, accessKey: 'key-cte-1' }),
      doc({ id: 'nfe-solta', documentType: FiscalDocumentType.NFE, accessKey: 'key-nfe-solta' }),
    ];
    const related = buildRelatedDocumentIdSet(documents);
    expect(related.has('mdfe-1')).toBe(true);
    expect(related.has('cte-1')).toBe(true);
    expect(related.has('nfe-solta')).toBe(false); // nunca relacionado por aproximacao -- ninguem manifesta essa chave
  });

  it('nunca marca relacionamento quando a chave manifestada nao corresponde a NENHUM documento do lote (chamador nao carregou)', () => {
    const documents = [doc({ id: 'mdfe-1', documentType: FiscalDocumentType.MDFE, metadata: { manifestedAccessKeys: ['key-fora-do-lote'] } })];
    expect(buildRelatedDocumentIdSet(documents)).toEqual(new Set());
  });

  it('MDF-e sem manifesto (metadata vazio/nulo) nunca gera relacionamento', () => {
    const documents = [
      doc({ id: 'mdfe-1', documentType: FiscalDocumentType.MDFE, metadata: null }),
      doc({ id: 'cte-1', documentType: FiscalDocumentType.CTE, accessKey: 'key-cte-1' }),
    ];
    expect(buildRelatedDocumentIdSet(documents)).toEqual(new Set());
  });

  it('um MDF-e manifestando varios documentos marca todos', () => {
    const documents = [
      doc({ id: 'mdfe-1', documentType: FiscalDocumentType.MDFE, metadata: { manifestedAccessKeys: ['key-cte-1', 'key-nfe-1'] } }),
      doc({ id: 'cte-1', documentType: FiscalDocumentType.CTE, accessKey: 'key-cte-1' }),
      doc({ id: 'nfe-1', documentType: FiscalDocumentType.NFE, accessKey: 'key-nfe-1' }),
    ];
    const related = buildRelatedDocumentIdSet(documents);
    expect(related).toEqual(new Set(['mdfe-1', 'cte-1', 'nfe-1']));
  });
});
