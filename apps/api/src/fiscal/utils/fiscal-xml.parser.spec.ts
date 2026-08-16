import { FiscalDocumentType } from '@prisma/client';
import { identifyFiscalDocumentType, parseFiscalXml } from './fiscal-xml.parser';

const NFE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe35260812345678000199550010000012341234567890" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <natOp>Venda</natOp>
        <serie>1</serie>
        <nNF>1234</nNF>
        <dhEmi>2026-08-01T10:00:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>Empresa Emitente LTDA</xNome>
      </emit>
      <dest>
        <CNPJ>98765432000188</CNPJ>
        <xNome>Empresa Destinataria LTDA</xNome>
      </dest>
      <total>
        <ICMSTot>
          <vBC>1000.00</vBC>
          <vNF>1500.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;

const CTE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cteProc versao="4.00">
  <CTe>
    <infCte Id="CTe35260812345678000199570010000056781234567890" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <serie>2</serie>
        <nCT>5678</nCT>
        <dhEmi>2026-08-02T08:30:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>11222333000144</CNPJ>
        <xNome>Transportadora Exemplo LTDA</xNome>
      </emit>
      <dest>
        <CNPJ>98765432000188</CNPJ>
        <xNome>Cliente Final LTDA</xNome>
      </dest>
      <vPrest>
        <vTPrest>850.50</vTPrest>
      </vPrest>
    </infCte>
  </CTe>
</cteProc>`;

const MDFE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<mdfeProc versao="3.00">
  <MDFe>
    <infMDFe Id="MDFe35260812345678000199580010000091011234567890" versao="3.00">
      <ide>
        <cUF>35</cUF>
        <serie>1</serie>
        <nMDF>9101</nMDF>
        <dhEmi>2026-08-03T07:00:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>11222333000144</CNPJ>
        <xNome>Transportadora Exemplo LTDA</xNome>
      </emit>
    </infMDFe>
  </MDFe>
</mdfeProc>`;

describe('identifyFiscalDocumentType', () => {
  it('identifica NF-e/CT-e/MDF-e pelo elemento infNFe/infCte/infMDFe', () => {
    expect(identifyFiscalDocumentType(NFE_XML)).toBe(FiscalDocumentType.NFE);
    expect(identifyFiscalDocumentType(CTE_XML)).toBe(FiscalDocumentType.CTE);
    expect(identifyFiscalDocumentType(MDFE_XML)).toBe(FiscalDocumentType.MDFE);
  });

  it('retorna null para XML nao reconhecido (nunca adivinha o tipo)', () => {
    expect(identifyFiscalDocumentType('<algumaCoisa><foo>bar</foo></algumaCoisa>')).toBeNull();
    expect(identifyFiscalDocumentType('')).toBeNull();
  });

  it('funciona tanto no XML "solto" quanto no "processado" (wrapper Proc)', () => {
    const bareNfe = `<NFe><infNFe Id="NFe35260812345678000199550010000012341234567890"><ide><nNF>1</nNF></ide></infNFe></NFe>`;
    expect(identifyFiscalDocumentType(bareNfe)).toBe(FiscalDocumentType.NFE);
  });
});

describe('parseFiscalXml -- NF-e', () => {
  it('extrai chave, numero, serie, data, emitente, destinatario e valor', () => {
    const result = parseFiscalXml(NFE_XML);
    expect(result).not.toBeNull();
    expect(result?.documentType).toBe(FiscalDocumentType.NFE);
    expect(result?.accessKey).toBe('35260812345678000199550010000012341234567890');
    expect(result?.documentNumber).toBe('1234');
    expect(result?.series).toBe('1');
    expect(result?.issueDate?.toISOString()).toBe(new Date('2026-08-01T10:00:00-03:00').toISOString());
    expect(result?.senderName).toBe('Empresa Emitente LTDA');
    expect(result?.senderDocument).toBe('12345678000199');
    expect(result?.recipientName).toBe('Empresa Destinataria LTDA');
    expect(result?.recipientDocument).toBe('98765432000188');
    expect(result?.amount).toBe(1500);
  });
});

describe('parseFiscalXml -- CT-e', () => {
  it('extrai campos equivalentes usando nCT/vTPrest', () => {
    const result = parseFiscalXml(CTE_XML);
    expect(result?.documentType).toBe(FiscalDocumentType.CTE);
    expect(result?.accessKey).toBe('35260812345678000199570010000056781234567890');
    expect(result?.documentNumber).toBe('5678');
    expect(result?.amount).toBe(850.5);
  });
});

describe('parseFiscalXml -- MDF-e', () => {
  it('nunca inventa destinatario/valor (MDF-e nao tem nenhum dos dois)', () => {
    const result = parseFiscalXml(MDFE_XML);
    expect(result?.documentType).toBe(FiscalDocumentType.MDFE);
    expect(result?.documentNumber).toBe('9101');
    expect(result?.recipientName).toBeNull();
    expect(result?.recipientDocument).toBeNull();
    expect(result?.amount).toBeNull();
  });
});

describe('parseFiscalXml -- tolerancia e campos ausentes', () => {
  it('retorna null quando o XML nao e um dos 3 tipos suportados', () => {
    expect(parseFiscalXml('<comprovante><foo>bar</foo></comprovante>')).toBeNull();
  });

  it('nunca inventa campos ausentes -- ficam null', () => {
    const minimal = `<infNFe Id="NFe35260812345678000199550010000012341234567890"><ide></ide><emit></emit></infNFe>`;
    const result = parseFiscalXml(minimal);
    expect(result?.documentNumber).toBeNull();
    expect(result?.series).toBeNull();
    expect(result?.issueDate).toBeNull();
    expect(result?.senderName).toBeNull();
    expect(result?.recipientName).toBeNull();
    expect(result?.amount).toBeNull();
  });

  it('sem chave de acesso identificavel, retorna accessKey null (nunca inventada)', () => {
    const noKey = `<infNFe><ide><nNF>1</nNF></ide></infNFe>`;
    expect(parseFiscalXml(noKey)?.accessKey).toBeNull();
  });
});
