import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { assertValidFileSignature } from './file-signature.util';

async function writeTempFile(content: Buffer | string): Promise<string> {
  const filePath = join(tmpdir(), `file-signature-spec-${randomUUID()}`);
  await fs.writeFile(filePath, content);
  return filePath;
}

describe('assertValidFileSignature', () => {
  it('aceita PDF com assinatura binaria "%PDF-" valida', async () => {
    const filePath = await writeTempFile(Buffer.from('%PDF-1.4\n...conteudo...'));
    await expect(assertValidFileSignature(filePath, 'PDF')).resolves.toBeUndefined();
  });

  it('rejeita PDF sem a assinatura binaria esperada', async () => {
    const filePath = await writeTempFile(Buffer.from('nao e um pdf de verdade'));
    await expect(assertValidFileSignature(filePath, 'PDF')).rejects.toThrow('Arquivo invalido');
  });

  it('aceita XML de texto comecando com "<"', async () => {
    const filePath = await writeTempFile('<?xml version="1.0"?><infNFe></infNFe>');
    await expect(assertValidFileSignature(filePath, 'XML')).resolves.toBeUndefined();
  });

  it('aceita XML mesmo com espacos/quebras de linha antes do "<"', async () => {
    const filePath = await writeTempFile('\n\n  <infNFe></infNFe>');
    await expect(assertValidFileSignature(filePath, 'XML')).resolves.toBeUndefined();
  });

  it('rejeita "XML" cujo conteudo nao comeca com "<" (nunca confia so na extensao)', async () => {
    const filePath = await writeTempFile('isto nao e xml');
    await expect(assertValidFileSignature(filePath, 'XML')).rejects.toThrow('Arquivo invalido');
  });

  it('rejeita "XML" com conteudo binario disfarcado (byte NUL nos primeiros bytes)', async () => {
    const filePath = await writeTempFile(Buffer.from([0x00, 0x01, 0x02, 0x3c, 0x78, 0x6d, 0x6c]));
    await expect(assertValidFileSignature(filePath, 'XML')).rejects.toThrow('Arquivo invalido');
  });

  it('aceita JPEG/PNG com assinatura binaria valida', async () => {
    const jpeg = await writeTempFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    await expect(assertValidFileSignature(jpeg, 'JPEG')).resolves.toBeUndefined();

    const png = await writeTempFile(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    await expect(assertValidFileSignature(png, 'PNG')).resolves.toBeUndefined();
  });

  it('rejeita um executavel renomeado para .png/.pdf (assinatura nao bate)', async () => {
    const fakePng = await writeTempFile(Buffer.from([0x4d, 0x5a, 0x90, 0x00])); // "MZ" (PE/EXE)
    await expect(assertValidFileSignature(fakePng, 'PNG')).rejects.toThrow('Arquivo invalido');
    await expect(assertValidFileSignature(fakePng, 'PDF')).rejects.toThrow('Arquivo invalido');
  });
});
