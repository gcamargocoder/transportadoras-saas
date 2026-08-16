// Fase 52, secao 5 -- normaliza a chave de acesso antes de gravar/comparar
// (remove espacos/pontuacao que alguns geradores de XML inserem) e valida o
// tamanho real (44 digitos, padrao NF-e/CT-e/MDF-e). Uma chave com tamanho
// errado NUNCA e aceita como valida -- retorna null em vez de truncar/
// completar (nunca inventa digitos).
export function normalizeAccessKey(accessKey: string | null | undefined): string | null {
  if (!accessKey) return null;
  const digits = accessKey.replace(/\D/g, '');
  return digits.length === 44 ? digits : null;
}

// Fase 54, secao 1 -- digito verificador (DV) da chave de acesso: modulo 11
// sobre os 43 primeiros digitos, pesos 2-9 ciclando da direita para a
// esquerda (mesmo algoritmo publico usado por NF-e/CT-e/MDF-e -- identico
// em espirito ao mod-11 ja usado para CPF neste projeto, ver
// drivers/utils/cpf.util.ts). Verifica so a CONSISTENCIA ARITMETICA interna
// da propria chave -- nunca uma consulta a SEFAZ.
export function computeAccessKeyCheckDigit(first43Digits: string): number {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9];
  let sum = 0;
  for (let i = 0; i < first43Digits.length; i++) {
    const digit = Number(first43Digits[first43Digits.length - 1 - i]);
    sum += digit * weights[i % weights.length]!;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

// Chave ja deve estar normalizada (44 digitos) -- ver normalizeAccessKey.
export function isAccessKeyCheckDigitValid(normalizedAccessKey: string): boolean {
  if (!/^\d{44}$/.test(normalizedAccessKey)) return false;
  const providedDv = Number(normalizedAccessKey[43]);
  return computeAccessKeyCheckDigit(normalizedAccessKey.slice(0, 43)) === providedDv;
}

// Fase 54 -- "modelo do documento fiscal" (2 digitos, posicoes 21-22 da
// chave), codigo oficial: 55=NF-e, 57=CT-e, 58=MDF-e. Usado so para
// conferir consistencia estrutural entre a chave e o FiscalDocumentType
// informado/reconhecido -- nunca uma validacao de autenticidade.
const ACCESS_KEY_MODEL_CODE: Record<'NFE' | 'CTE' | 'MDFE', string> = {
  NFE: '55',
  CTE: '57',
  MDFE: '58',
};

export function getAccessKeyModelCode(normalizedAccessKey: string): string | null {
  if (!/^\d{44}$/.test(normalizedAccessKey)) return null;
  return normalizedAccessKey.slice(20, 22);
}

export function getExpectedAccessKeyModelCode(documentType: 'NFE' | 'CTE' | 'MDFE'): string {
  return ACCESS_KEY_MODEL_CODE[documentType];
}
