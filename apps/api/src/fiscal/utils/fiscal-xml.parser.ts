import { FiscalDocumentType } from '@prisma/client';

// Fase 52, secao 4 -- parser SEGURO e TOLERANTE (regex sobre o texto, mesmo
// padrao ja usado por antt-kml.parser.ts, sem dependencia XML nova) para
// identificar campos basicos de NF-e/CT-e/MDF-e. NUNCA valida autenticidade
// perante a SEFAZ -- so reconhece estrutura/conteudo. Campo ausente vira
// null, nunca inventado/estimado.
export interface ParsedFiscalDocument {
  documentType: FiscalDocumentType;
  accessKey: string | null;
  documentNumber: string | null;
  series: string | null;
  issueDate: Date | null;
  senderName: string | null;
  senderDocument: string | null;
  recipientName: string | null;
  recipientDocument: string | null;
  /// Valor total do documento, quando extraivel -- vai para
  /// FiscalDocument.metadata (nao e coluna propria, ver schema).
  amount: number | null;
  /// Fase 55, secao 3 -- chaves de acesso (NF-e/CT-e) que este MDF-e
  /// manifesta, quando o XML contem <chNFe>/<chCTe> (elementos padrao do
  /// bloco <infDoc> do MDF-e real). SEMPRE null para NF-e/CT-e (nao fazem
  /// manifesto de outros documentos) e para MDF-e sem nenhuma chave
  /// encontrada -- nunca um relacionamento inventado, so o que o proprio
  /// XML ja declara.
  manifestedAccessKeys: string[] | null;
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  const value = match ? match[1]!.trim() : null;
  return value ? value : null;
}

function extractBlock(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? match[1]! : null;
}

// A chave de acesso (44 digitos) vem sempre no atributo Id do elemento
// infNFe/infCte/infMDFe -- ex: Id="NFe35260812345678000199550010000012341234567890".
// O prefixo (NFe/CTe/MDFe) e opcional na leitura -- alguns geradores omitem.
function extractAccessKeyFromId(xml: string, infTag: string): string | null {
  const match = xml.match(new RegExp(`<${infTag}[^>]*\\bId="(?:NFe|CTe|MDFe)?(\\d{44})"`));
  return match ? match[1]! : null;
}

function parseIssueDate(raw: string | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAmount(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// Fase 55 -- <chNFe>/<chCTe> sao os elementos padrao do bloco <infDoc> de um
// MDF-e real, listando as chaves de acesso das NF-e/CT-e que ele manifesta.
// So reconhece o que o XML ja declara explicitamente -- nunca infere uma
// relacao a partir de outros campos (emitente, data, etc.).
function extractManifestedAccessKeys(xml: string): string[] | null {
  const matches = xml.matchAll(/<ch(?:NFe|CTe)>(\d{44})<\/ch(?:NFe|CTe)>/g);
  const keys = Array.from(new Set(Array.from(matches, (match) => match[1]!)));
  return keys.length > 0 ? keys : null;
}

// Subconjunto de FiscalDocumentType que este parser reconhece (secao 4 do
// pedido: "suportar inicialmente identificacao de NF-e/CT-e/MDF-e") -- os
// demais tipos do enum (CIOT/DACTE/DAMDFE/DELIVERY_PROOF/OTHER) so entram
// via upload manual, nunca via importacao de XML.
export type RecognizedFiscalDocumentType = typeof FiscalDocumentType.NFE | typeof FiscalDocumentType.CTE | typeof FiscalDocumentType.MDFE;

// Identifica o tipo pelo elemento <infNFe>/<infCte>/<infMDFe> -- presente
// tanto no XML "solto" (ex: <NFe><infNFe>...) quanto no XML "processado"
// (ex: <nfeProc><NFe><infNFe>...), sem depender do elemento raiz.
export function identifyFiscalDocumentType(xml: string): RecognizedFiscalDocumentType | null {
  // MDF-e checado PRIMEIRO: um MDF-e real (com manifesto, Fase 55) tem seu
  // proprio <infMDFe> no nivel raiz, mas o bloco <infDoc> aninhado contem
  // <infNFe>/<infCTe> por documento manifestado -- checar infMDFe antes
  // evita identificar um MDF-e completo como NF-e/CT-e por causa dos
  // elementos filhos do manifesto.
  if (/<infMDFe[\s>]/.test(xml)) return FiscalDocumentType.MDFE;
  if (/<infNFe[\s>]/.test(xml)) return FiscalDocumentType.NFE;
  if (/<infCte[\s>]/.test(xml)) return FiscalDocumentType.CTE;
  return null;
}

const NUMBER_TAG_BY_TYPE: Record<'NFE' | 'CTE' | 'MDFE', string> = {
  NFE: 'nNF',
  CTE: 'nCT',
  MDFE: 'nMDF',
};

const INF_TAG_BY_TYPE: Record<'NFE' | 'CTE' | 'MDFE', string> = {
  NFE: 'infNFe',
  CTE: 'infCte',
  MDFE: 'infMDFe',
};

// Retorna null quando o XML nao e reconhecido como NF-e/CT-e/MDF-e (nunca
// lanca -- quem chama decide o que fazer com "tipo nao identificado", ver
// FiscalDocumentsService.importXml).
export function parseFiscalXml(xml: string): ParsedFiscalDocument | null {
  const documentType = identifyFiscalDocumentType(xml);
  if (!documentType) return null;

  const accessKey = extractAccessKeyFromId(xml, INF_TAG_BY_TYPE[documentType]);

  const ideBlock = extractBlock(xml, 'ide') ?? '';
  const documentNumber = extractTag(ideBlock, NUMBER_TAG_BY_TYPE[documentType]);
  const series = extractTag(ideBlock, 'serie');
  const issueDate = parseIssueDate(extractTag(ideBlock, 'dhEmi') ?? extractTag(ideBlock, 'dEmi'));

  const emitBlock = extractBlock(xml, 'emit') ?? '';
  const senderName = extractTag(emitBlock, 'xNome');
  const senderDocument = extractTag(emitBlock, 'CNPJ') ?? extractTag(emitBlock, 'CPF');

  // MDF-e nao tem destinatario (e um manifesto de varios CT-e/NF-e) --
  // nunca inventado para esse tipo.
  let recipientName: string | null = null;
  let recipientDocument: string | null = null;
  if (documentType !== FiscalDocumentType.MDFE) {
    const destBlock = extractBlock(xml, 'dest') ?? '';
    recipientName = extractTag(destBlock, 'xNome');
    recipientDocument = extractTag(destBlock, 'CNPJ') ?? extractTag(destBlock, 'CPF');
  }

  let amount: number | null = null;
  if (documentType === FiscalDocumentType.NFE) {
    const totalBlock = extractBlock(xml, 'ICMSTot') ?? '';
    amount = parseAmount(extractTag(totalBlock, 'vNF'));
  } else if (documentType === FiscalDocumentType.CTE) {
    const vPrestBlock = extractBlock(xml, 'vPrest') ?? '';
    amount = parseAmount(extractTag(vPrestBlock, 'vTPrest'));
  }
  // MDF-e nao tem um "valor do documento" (idem destinatario) -- fica null.

  const manifestedAccessKeys = documentType === FiscalDocumentType.MDFE ? extractManifestedAccessKeys(xml) : null;

  return {
    documentType,
    accessKey,
    documentNumber,
    series,
    issueDate,
    senderName,
    senderDocument,
    recipientName,
    recipientDocument,
    amount,
    manifestedAccessKeys,
  };
}
