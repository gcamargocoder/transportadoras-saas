// Remove tudo que nao for digito (aceita CPF formatado "123.456.789-09" ou
// so numeros na entrada, mas sempre persiste/compara apenas os digitos).
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

function calculateCheckDigit(base: string, initialFactor: number): number {
  let total = 0;
  let factor = initialFactor;
  for (const digit of base) {
    total += Number(digit) * factor;
    factor -= 1;
  }
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

// Validacao real do CPF (algoritmo dos digitos verificadores da Receita
// Federal), nao apenas contagem de digitos -- rejeita tambem sequencias
// obvias invalidas (ex: "111.111.111-11").
export function isValidCpf(value: string): boolean {
  const digits = normalizeCpf(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const base = digits.slice(0, 9);
  const firstCheckDigit = calculateCheckDigit(base, 10);
  const secondCheckDigit = calculateCheckDigit(base + firstCheckDigit.toString(), 11);

  return digits === `${base}${firstCheckDigit}${secondCheckDigit}`;
}
