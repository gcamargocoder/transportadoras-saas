// Mesmo utilitario do backend (apps/api/src/common/utils/compact.util.ts) --
// remove chaves com valor `undefined` de um objeto. Necessario sob
// exactOptionalPropertyTypes: "chave omitida" e "chave = undefined" sao
// coisas diferentes; nunca podemos passar `undefined` explicitamente para um
// campo opcional.
type Compacted<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

export function compact<T extends Record<string, unknown>>(obj: T): Compacted<T> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Compacted<T>;
}
