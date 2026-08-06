// Converte um valor (tipicamente um registro retornado pelo Prisma, com
// Date/etc) em um objeto JSON puro, seguro para gravar em colunas Json --
// usado ao montar previousValue/newValue de AuditLog. Evita cada service
// reimplementar o mesmo JSON.parse(JSON.stringify(...)).
export function toJsonSafe<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
