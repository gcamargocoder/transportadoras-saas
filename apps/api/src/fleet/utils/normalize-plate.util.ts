// Normaliza a placa para persistencia/comparacao: maiuscula, sem hifen/
// espacos (aceita tanto "ABC-1234" quanto "abc1234" na entrada).
export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
