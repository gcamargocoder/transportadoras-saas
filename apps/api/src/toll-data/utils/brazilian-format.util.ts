// Fase 33/35 -- extraido de antt-kml.parser.ts para ser reaproveitado pelo
// parser de tarifas por concessao (antt-concession-tariff.parser.ts) sem
// duplicar a mesma regra de interpretacao de numero/texto publicados pela
// ANTT (nunca reimplementar em dois lugares).

// Numeros brasileiros ("67,8", "-23,34121", "1.234,56") -- nunca
// interpretados como milhar/decimal americano.
export function parseBrazilianDecimal(value: string | undefined | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
