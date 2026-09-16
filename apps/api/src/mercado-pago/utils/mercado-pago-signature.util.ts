import { createHmac, timingSafeEqual } from 'node:crypto';

export interface MercadoPagoSignatureInput {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string;
  secret: string;
}

// Valida o header x-signature do webhook do Mercado Pago (formato
// "ts=<timestamp>,v1=<hash>"). Manifest e HMAC-SHA256 conforme documentacao
// oficial do Mercado Pago para validacao de notificacoes webhook. Comparacao
// em tempo constante (timingSafeEqual) -- nunca ===/comparacao ingenua de
// string, para nao vazar timing de qual prefixo do hash bateu.
export function isValidMercadoPagoSignature(input: MercadoPagoSignatureInput): boolean {
  const { xSignature, xRequestId, dataId, secret } = input;
  if (!xSignature || !xRequestId || !secret) {
    return false;
  }

  const parts = new Map<string, string>();
  for (const part of xSignature.split(',')) {
    const [key, value] = part.split('=').map((piece) => piece.trim());
    if (key && value) parts.set(key, value);
  }

  const timestamp = parts.get('ts');
  const receivedHash = parts.get('v1');
  if (!timestamp || !receivedHash) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${timestamp};`;
  const expectedHash = createHmac('sha256', secret).update(manifest).digest('hex');

  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const receivedBuffer = Buffer.from(receivedHash, 'hex');
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
