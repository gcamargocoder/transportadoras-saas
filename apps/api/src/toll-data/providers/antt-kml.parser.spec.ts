import { buildAnttSourceKey, parseAnttKml } from './antt-kml.parser';

// Fixture com 3 placemarks REAIS, copiados literalmente do arquivo baixado
// em 10/08/2026 de
// https://dados.antt.gov.br/dataset/a7e1e12d-f8e8-40cd-bc1f-57973a4a4a6d/resource/1a32b252-e47f-4698-a098-9e4ba956af30/download/praca-de-pedagio.kmz
// (dataset "Praca de Pedagio" -- ANTT, 158 pracas na versao coletada).
// Nenhum campo foi inventado ou "limpo" -- inclusive os nomes truncados em
// 10 caracteres (praca_de_p, ano_do_pnv, data_da_in) sao exatamente como a
// ANTT publica.
const REAL_ANTT_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document id="dados_das_pracas_de_pedagio">
  <name>dados_das_pracas_de_pedagio</name>
  <Folder id="FeatureLayer0">
    <name>dados_das_pracas_de_pedagio</name>
    <Placemark id="ID_00000">
      <name>AUTOPISTA FERNÃO DIAS</name>
      <description><![CDATA[<html><body><table>
<tr><td>FID</td><td>0</td></tr>
<tr bgcolor="#D4E4F3"><td>concession</td><td>AUTOPISTA FERNÃO DIAS</td></tr>
<tr><td>praca_de_p</td><td>1 Norte - Defasada (Mairiporã)</td></tr>
<tr bgcolor="#D4E4F3"><td>ano_do_pnv</td><td>2007</td></tr>
<tr><td>rodovia</td><td>BR-381</td></tr>
<tr bgcolor="#D4E4F3"><td>uf</td><td>SP</td></tr>
<tr><td>km_m</td><td>67,8</td></tr>
<tr bgcolor="#D4E4F3"><td>municipio</td><td>Mairiporã</td></tr>
<tr><td>tipo_pista</td><td>Principal</td></tr>
<tr bgcolor="#D4E4F3"><td>sentido</td><td>Decrescente</td></tr>
<tr><td>situacao</td><td>Ativo</td></tr>
<tr bgcolor="#D4E4F3"><td>data_da_in</td><td></td></tr>
<tr><td>latitude</td><td>-23,34121</td></tr>
<tr bgcolor="#D4E4F3"><td>longitude</td><td>-46,573664</td></tr>
</table></body></html>
]]></description>
      <styleUrl>#IconStyle00</styleUrl>
      <Point><coordinates> -46.573664,-23.34121,0</coordinates></Point>
    </Placemark>
    <Placemark id="ID_00001">
      <name>AUTOPISTA FERNÃO DIAS</name>
      <description><![CDATA[<html><body><table>
<tr><td>FID</td><td>1</td></tr>
<tr bgcolor="#D4E4F3"><td>concession</td><td>AUTOPISTA FERNÃO DIAS</td></tr>
<tr><td>praca_de_p</td><td>1 Norte (Mairiporã)</td></tr>
<tr bgcolor="#D4E4F3"><td>ano_do_pnv</td><td>2007</td></tr>
<tr><td>rodovia</td><td>BR-381</td></tr>
<tr bgcolor="#D4E4F3"><td>uf</td><td>SP</td></tr>
<tr><td>km_m</td><td>65,7</td></tr>
<tr bgcolor="#D4E4F3"><td>municipio</td><td>Mairiporã</td></tr>
<tr><td>tipo_pista</td><td>Principal</td></tr>
<tr bgcolor="#D4E4F3"><td>sentido</td><td>Decrescente</td></tr>
<tr><td>situacao</td><td>Ativo</td></tr>
<tr bgcolor="#D4E4F3"><td>data_da_in</td><td></td></tr>
<tr><td>latitude</td><td>-23,322298</td></tr>
<tr bgcolor="#D4E4F3"><td>longitude</td><td>-46,581097</td></tr>
</table></body></html>
]]></description>
      <styleUrl>#IconStyle00</styleUrl>
      <Point><coordinates> -46.581097,-23.322298,0</coordinates></Point>
    </Placemark>
    <Placemark id="ID_00002">
      <name>AUTOPISTA FERNÃO DIAS</name>
      <description><![CDATA[<html><body><table>
<tr><td>FID</td><td>2</td></tr>
<tr bgcolor="#D4E4F3"><td>concession</td><td>AUTOPISTA FERNÃO DIAS</td></tr>
<tr><td>praca_de_p</td><td>1 Sul (Mairiporã)</td></tr>
<tr bgcolor="#D4E4F3"><td>ano_do_pnv</td><td>2007</td></tr>
<tr><td>rodovia</td><td>BR-381</td></tr>
<tr bgcolor="#D4E4F3"><td>uf</td><td>SP</td></tr>
<tr><td>km_m</td><td>66,6</td></tr>
<tr bgcolor="#D4E4F3"><td>municipio</td><td>Mairiporã</td></tr>
<tr><td>tipo_pista</td><td>Principal</td></tr>
<tr bgcolor="#D4E4F3"><td>sentido</td><td>Crescente</td></tr>
<tr><td>situacao</td><td>Ativo</td></tr>
<tr bgcolor="#D4E4F3"><td>data_da_in</td><td></td></tr>
<tr><td>latitude</td><td>-23,330558</td></tr>
<tr bgcolor="#D4E4F3"><td>longitude</td><td>-46,578337</td></tr>
</table></body></html>
]]></description>
      <styleUrl>#IconStyle00</styleUrl>
      <Point><coordinates> -46.578337,-23.330558,0</coordinates></Point>
    </Placemark>
  </Folder>
</Document>
</kml>`;

describe('parseAnttKml (fixture com dados reais da ANTT)', () => {
  it('extrai as 3 pracas reais com todos os campos normalizados corretamente', () => {
    const result = parseAnttKml(REAL_ANTT_KML);

    expect(result).toHaveLength(3);
    const [first, second, third] = result;

    expect(first).toMatchObject({
      name: 'AUTOPISTA FERNÃO DIAS - 1 Norte - Defasada (Mairiporã)',
      concessionaire: 'AUTOPISTA FERNÃO DIAS',
      highway: 'BR-381',
      km: 67.8,
      city: 'Mairiporã',
      state: 'SP',
      status: 'Ativo',
    });
    expect(first!.latitude).toBeCloseTo(-23.34121, 5);
    expect(first!.longitude).toBeCloseTo(-46.573664, 5);

    expect(second!.km).toBe(65.7);
    expect(third!.km).toBe(66.6);
  });

  it('numeros brasileiros (virgula decimal) sao convertidos corretamente, nunca interpretados como milhar', () => {
    const result = parseAnttKml(REAL_ANTT_KML);
    // "67,8" -- se fosse mal interpretado como "678" o teste abaixo falharia.
    expect(result[0]!.km).toBe(67.8);
    expect(result[0]!.km).not.toBe(678);
  });

  it('cada praca recebe uma sourceKey deterministica e distinta das demais (nunca duplicada)', () => {
    const result = parseAnttKml(REAL_ANTT_KML);
    const keys = result.map((p) => p.sourceKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toContain('ANTT:');
  });

  it('reprocessar o MESMO KML gera exatamente as mesmas sourceKeys (idempotencia da normalizacao)', () => {
    const firstRun = parseAnttKml(REAL_ANTT_KML).map((p) => p.sourceKey);
    const secondRun = parseAnttKml(REAL_ANTT_KML).map((p) => p.sourceKey);
    expect(secondRun).toEqual(firstRun);
  });

  it('guarda o registro bruto (raw) para auditoria, sem alterar os valores originais da fonte', () => {
    const [first] = parseAnttKml(REAL_ANTT_KML);
    expect(first!.raw.km_m).toBe('67,8'); // valor bruto, formato original preservado
    expect(first!.raw.praca_de_p).toBe('1 Norte - Defasada (Mairiporã)');
  });

  it('NAO inventa nenhum campo de tarifa -- a fonte simplesmente nao fornece isso', () => {
    const [first] = parseAnttKml(REAL_ANTT_KML);
    expect(first).not.toHaveProperty('price');
    expect(first).not.toHaveProperty('pricePerAxle');
    expect(first).not.toHaveProperty('tariff');
  });

  it('placemark sem concessionaria identificavel e rejeitado (nunca adivinhado)', () => {
    const kmlSemConcessao = REAL_ANTT_KML.replace(
      '<td>concession</td><td>AUTOPISTA FERNÃO DIAS</td>',
      '<td>outro_campo</td><td>valor</td>',
    );
    const result = parseAnttKml(kmlSemConcessao);
    // A 1a praca (sem concession) foi descartada -- sobram 2, nao 3.
    expect(result).toHaveLength(2);
  });

  it('KML vazio ou sem Placemark retorna lista vazia, nunca lanca excecao', () => {
    expect(parseAnttKml('<kml></kml>')).toEqual([]);
    expect(parseAnttKml('')).toEqual([]);
  });
});

describe('buildAnttSourceKey', () => {
  it('e deterministica: mesmos campos sempre produzem a mesma chave', () => {
    const input = { concession: 'Autopista Fernão Dias', rodovia: 'br-381', km: 67.8, placaName: '1 Norte' };
    expect(buildAnttSourceKey(input)).toBe(buildAnttSourceKey({ ...input }));
  });

  it('e sensivel a diferencas reais (km diferente gera chave diferente)', () => {
    const a = buildAnttSourceKey({ concession: 'X', rodovia: 'BR-381', km: 67.8, placaName: 'P1' });
    const b = buildAnttSourceKey({ concession: 'X', rodovia: 'BR-381', km: 65.7, placaName: 'P1' });
    expect(a).not.toBe(b);
  });

  it('normaliza caixa/espacos (nao trata "BR-381" e "br-381 " como pracas diferentes)', () => {
    const a = buildAnttSourceKey({ concession: 'Autopista X', rodovia: 'BR-381', km: 1, placaName: 'P1' });
    const b = buildAnttSourceKey({ concession: '  autopista x  ', rodovia: 'br-381 ', km: 1, placaName: 'p1' });
    expect(a).toBe(b);
  });
});
