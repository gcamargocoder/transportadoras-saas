const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/i;

function unitToMs(unit: string): number {
  switch (unit.toLowerCase()) {
    case 's':
      return 1000;
    case 'm':
      return 60 * 1000;
    case 'h':
      return 60 * 60 * 1000;
    case 'd':
      return 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unidade de duracao invalida: "${unit}"`);
  }
}

// Parser minimo para os formatos usados em JWT_*_EXPIRES_IN ("15m", "1h",
// "7d"). Nao usa a lib "ms" para nao adicionar uma dependencia so para isso
// -- o formato aceito e sempre o que nos mesmos definimos via env.validation.
export function parseDurationToMs(duration: string): number {
  const match = DURATION_PATTERN.exec(duration.trim());
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Formato de duracao invalido: "${duration}". Use algo como "15m", "1h", "7d".`);
  }
  return Number(match[1]) * unitToMs(match[2]);
}

export function addDuration(duration: string, from: Date = new Date()): Date {
  return new Date(from.getTime() + parseDurationToMs(duration));
}
