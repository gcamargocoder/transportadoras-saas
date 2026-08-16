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
