// Formato de chassi (VIN -- Vehicle Identification Number): exatamente 17
// caracteres alfanumericos maiusculos, excluindo I/O/Q (facilmente
// confundidos com 1/0), conforme ISO 3779. Assim como RENAVAM, validamos
// apenas o FORMATO -- o digito verificador do VIN (posicao 9) depende de
// uma tabela de pesos por pais/fabricante nao publica de forma unificada.
const CHASSIS_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeChassisNumber(chassis: string): string {
  return chassis.trim().toUpperCase();
}

export function isValidChassisNumber(value: string): boolean {
  return CHASSIS_PATTERN.test(normalizeChassisNumber(value));
}
