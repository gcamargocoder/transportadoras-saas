// Fase 35/36 -- extraido para ser reaproveitado por qualquer parser de
// tarifa por eixo (ANTT_TARIFAS, RJ_AGETRANSP): quando a mesma contagem de
// eixos aparece em mais de um grupo distinto na mesma tabela (ex: "2 eixos
// simples" = carro vs "2 eixos dupla" = caminhao leve -- valores
// DIFERENTES), a categoria de eixos ("N eixos") sozinha nao identifica com
// seguranca qual valor vale -- nunca decide por adivinhacao. groupKey e
// qualquer identificador que distinga as categorias que colidem no mesmo
// axleCount (numero da categoria na ANTT, texto "eixos simples/dupla" na
// AGETRANSP).
export function findAmbiguousAxleCounts(rows: { axleCount: number | null; groupKey: string }[]): Set<number> {
  const axleCountToGroups = new Map<number, Set<string>>();
  for (const row of rows) {
    if (row.axleCount === null) continue;
    const groups = axleCountToGroups.get(row.axleCount) ?? new Set<string>();
    groups.add(row.groupKey);
    axleCountToGroups.set(row.axleCount, groups);
  }
  return new Set(
    [...axleCountToGroups.entries()].filter(([, groups]) => groups.size > 1).map(([axleCount]) => axleCount),
  );
}
