import { resolveDocumentExpiryStatus } from './document-expiry.util';

describe('resolveDocumentExpiryStatus', () => {
  const now = new Date('2026-08-17T12:00:00Z');

  it('retorna NO_EXPIRY quando nao ha data de vencimento', () => {
    expect(resolveDocumentExpiryStatus(null, now)).toBe('NO_EXPIRY');
  });

  it('retorna EXPIRED quando a data ja passou', () => {
    expect(resolveDocumentExpiryStatus(new Date('2026-08-01T00:00:00Z'), now)).toBe('EXPIRED');
  });

  it('retorna EXPIRING_SOON dentro do limiar de 30 dias', () => {
    expect(resolveDocumentExpiryStatus(new Date('2026-09-01T00:00:00Z'), now)).toBe('EXPIRING_SOON');
  });

  it('retorna VALID quando o vencimento esta alem do limiar', () => {
    expect(resolveDocumentExpiryStatus(new Date('2027-01-01T00:00:00Z'), now)).toBe('VALID');
  });

  it('respeita um limiar customizado', () => {
    expect(resolveDocumentExpiryStatus(new Date('2026-08-25T00:00:00Z'), now, 5)).toBe('VALID');
    expect(resolveDocumentExpiryStatus(new Date('2026-08-20T00:00:00Z'), now, 5)).toBe('EXPIRING_SOON');
  });
});
