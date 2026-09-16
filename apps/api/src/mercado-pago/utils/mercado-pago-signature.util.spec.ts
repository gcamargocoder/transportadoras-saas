import { createHmac } from 'node:crypto';
import { isValidMercadoPagoSignature } from './mercado-pago-signature.util';

function buildSignature(dataId: string, requestId: string, secret: string, ts = '1700000000'): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${hash}`;
}

describe('isValidMercadoPagoSignature', () => {
  const SECRET = 'webhook-secret-123';
  const DATA_ID = 'payment-987';
  const REQUEST_ID = 'req-1';

  it('aceita uma assinatura valida', () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, SECRET);
    expect(
      isValidMercadoPagoSignature({ xSignature, xRequestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }),
    ).toBe(true);
  });

  it('rejeita quando o hash nao bate (secret errado)', () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, 'secret-errado');
    expect(
      isValidMercadoPagoSignature({ xSignature, xRequestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }),
    ).toBe(false);
  });

  it('rejeita quando o dataId foi alterado apos assinar', () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, SECRET);
    expect(
      isValidMercadoPagoSignature({ xSignature, xRequestId: REQUEST_ID, dataId: 'outro-id', secret: SECRET }),
    ).toBe(false);
  });

  it('rejeita quando x-signature esta ausente', () => {
    expect(
      isValidMercadoPagoSignature({ xSignature: undefined, xRequestId: REQUEST_ID, dataId: DATA_ID, secret: SECRET }),
    ).toBe(false);
  });

  it('rejeita quando x-request-id esta ausente', () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, SECRET);
    expect(
      isValidMercadoPagoSignature({ xSignature, xRequestId: undefined, dataId: DATA_ID, secret: SECRET }),
    ).toBe(false);
  });

  it('rejeita quando o secret esta vazio', () => {
    const xSignature = buildSignature(DATA_ID, REQUEST_ID, SECRET);
    expect(
      isValidMercadoPagoSignature({ xSignature, xRequestId: REQUEST_ID, dataId: DATA_ID, secret: '' }),
    ).toBe(false);
  });
});
