import { createHash } from 'crypto';
import { FinancialTransactionType } from '@prisma/client';

// Fase 80, secao 1 -- mesmo principio de header flexivel do
// toll-import-header.util.ts (Fase 46): cada banco nomeia as colunas do
// extrato de um jeito diferente, entao normalizamos o cabecalho e casamos
// contra apelidos conhecidos, em vez de exigir um layout exato.
export type CanonicalBankTransactionField = 'date' | 'description' | 'amount' | 'type' | 'externalId';

const HEADER_ALIASES: Record<CanonicalBankTransactionField, string[]> = {
  date: ['date', 'data', 'datamovimento', 'datalancamento', 'datatransacao'],
  description: ['description', 'descricao', 'historico', 'descricaolancamento', 'detalhes'],
  amount: ['amount', 'valor', 'valorlancamento', 'valortransacao'],
  type: ['type', 'tipo', 'tipolancamento', 'natureza'],
  externalId: ['externalid', 'id', 'fitid', 'identificador', 'idtransacao', 'codigo'],
};

// NFD decompoe acentos em base + marca de combinacao (ex: "a" + combining
// acute) -- filtrando so os caracteres ASCII depois da decomposicao tira o
// acento sem depender de uma lista de substituicoes por caractere (e sem
// regex de controle, que o eslint rejeita).
function normalizeHeader(text: string): string {
  const ascii = Array.from(text.normalize('NFD'))
    .filter((char) => char.charCodeAt(0) <= 127)
    .join('');
  return ascii.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function mapRowToCanonicalFields(row: Record<string, string>): Record<CanonicalBankTransactionField, string | undefined> {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeHeader(key), value] as const);
  const result = {} as Record<CanonicalBankTransactionField, string | undefined>;
  (Object.keys(HEADER_ALIASES) as CanonicalBankTransactionField[]).forEach((field) => {
    const aliases = HEADER_ALIASES[field];
    const match = normalizedEntries.find(([key]) => aliases.includes(key));
    result[field] = match?.[1];
  });
  return result;
}

// Secao 1 -- "valor deve ser normalizado para representacao monetaria
// segura. Nao usar float para calculos financeiros": aceita formato BR
// (1.234,56) ou US (1234.56), mas o retorno e sempre uma STRING decimal
// (nunca um `number` de JS) -- passada direto para a coluna Decimal do
// Prisma, sem passar por ponto flutuante em nenhum momento.
export function parseMonetaryAmount(raw: string): string | null {
  const trimmed = raw.trim().replace(/^R\$\s*/i, '');
  if (!trimmed) return null;
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  // amount e sempre positivo -- o sentido (CREDIT/DEBIT) vem da coluna
  // `type`, mesmo principio de FinancialTransaction.amount (Fase 78).
  return normalized.startsWith('-') ? normalized.slice(1) : normalized;
}

export function parseBankTransactionDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const iso = new Date(trimmed);
    if (!Number.isNaN(iso.getTime())) return iso;
  }
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

const TYPE_ALIASES: Record<string, FinancialTransactionType> = {
  credit: FinancialTransactionType.CREDIT,
  credito: FinancialTransactionType.CREDIT,
  c: FinancialTransactionType.CREDIT,
  debit: FinancialTransactionType.DEBIT,
  debito: FinancialTransactionType.DEBIT,
  d: FinancialTransactionType.DEBIT,
};

export function parseBankTransactionType(raw: string): FinancialTransactionType | null {
  const key = normalizeHeader(raw);
  return TYPE_ALIASES[key] ?? null;
}

// Secao 1 -- "pode existir mecanismo defensivo baseado em hash da linha
// original, desde que isso seja claramente documentado e nao seja usado
// como garantia absoluta de identidade" (usado somente quando o extrato
// nao fornece externalId -- ver bank-transactions-import.service.ts).
export function computeRowHash(date: Date, description: string, amount: string, type: FinancialTransactionType): string {
  const normalized = `${date.toISOString().slice(0, 10)}|${description.trim().toLowerCase()}|${amount}|${type}`;
  return createHash('sha256').update(normalized).digest('hex');
}
