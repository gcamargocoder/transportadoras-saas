// Remove chaves com valor `undefined` de um objeto. Necessario para montar
// objetos `data` de create/update do Prisma sob `exactOptionalPropertyTypes`
// -- nesse modo estrito, "chave omitida" e "chave = undefined" sao coisas
// diferentes, entao nunca podemos passar `undefined` explicitamente para um
// campo opcional dos tipos gerados pelo Prisma (ele exige omissao real).
//
// O tipo de retorno remove `undefined` do tipo de cada valor (Exclude), nao
// so torna a chave opcional -- e o que faz o resultado realmente compativel
// com os tipos *UpdateInput/*CreateInput do Prisma sob exactOptionalPropertyTypes.
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
