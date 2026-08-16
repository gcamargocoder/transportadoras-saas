import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';

// Fase 46 -- os dois pontos de upload do projeto (checklist evidence,
// toll-import) validavam so a EXTENSAO do nome de arquivo (nunca o
// mimetype nem o conteudo real) -- um executavel renomeado para ".png"/
// ".csv" passava. Esta checagem le os primeiros bytes do arquivo JA
// SALVO em disco (nome sempre gerado via randomUUID, nunca o nome do
// cliente) e confere contra a assinatura binaria esperada -- nunca confia
// no mimetype/extensao enviados pelo cliente.
// Fase 52 -- PDF/XML adicionados para o upload/importacao de documentos
// fiscais (mesmo mecanismo, nunca um validador paralelo).
export type ValidatedFileKind = 'JPEG' | 'PNG' | 'CSV' | 'XLSX' | 'PDF' | 'XML';

// JPEG/PNG/XLSX (ZIP)/PDF tem assinatura binaria fixa nos primeiros bytes.
// CSV/XML sao texto puro, sem assinatura -- a melhor checagem viavel sem
// reimplementar um parser e rejeitar se houver um byte NUL nos primeiros
// 8KB (forte indicio de arquivo binario disfarcado de texto; um CSV/XML
// legitimo nunca contem NUL).
const BINARY_SIGNATURES: Record<Exclude<ValidatedFileKind, 'CSV' | 'XML'>, number[]> = {
  JPEG: [0xff, 0xd8, 0xff],
  PNG: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  XLSX: [0x50, 0x4b],
  PDF: [0x25, 0x50, 0x44, 0x46, 0x2d], // "%PDF-"
};

const TEXT_SNIFF_BYTES = 8192;

async function readHeadBytes(filePath: string, length: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/// Lanca BadRequestException se o conteudo do arquivo em `filePath` nao
/// bater com a assinatura esperada para `kind`. NAO apaga o arquivo --
/// quem chama decide (mesmo padrao de safeUnlink ja usado no service que
/// chama esta funcao), para manter a responsabilidade de storage no
/// service, nao aqui.
export async function assertValidFileSignature(filePath: string, kind: ValidatedFileKind): Promise<void> {
  if (kind === 'CSV') {
    const head = await readHeadBytes(filePath, TEXT_SNIFF_BYTES);
    if (head.includes(0x00)) {
      throw new BadRequestException('Arquivo invalido: conteudo binario detectado onde um CSV de texto era esperado.');
    }
    return;
  }

  if (kind === 'XML') {
    const head = await readHeadBytes(filePath, TEXT_SNIFF_BYTES);
    if (head.includes(0x00)) {
      throw new BadRequestException('Arquivo invalido: conteudo binario detectado onde um XML de texto era esperado.');
    }
    // Checagem tolerante (nao e um parser XML completo, ver
    // fiscal/utils/fiscal-xml.parser.ts): o primeiro caractere nao-espaco
    // deve ser "<" -- descarta na hora qualquer arquivo que obviamente nao
    // e XML, sem exigir bem-formacao completa.
    const text = head.toString('utf8').trimStart();
    if (!text.startsWith('<')) {
      throw new BadRequestException('Arquivo invalido: conteudo nao parece ser XML (nao comeca com "<").');
    }
    return;
  }

  const signature = BINARY_SIGNATURES[kind];
  const head = await readHeadBytes(filePath, signature.length);
  const matches = signature.length <= head.length && signature.every((byte, index) => head[index] === byte);
  if (!matches) {
    throw new BadRequestException(`Arquivo invalido: conteudo nao corresponde ao formato ${kind} esperado.`);
  }
}
