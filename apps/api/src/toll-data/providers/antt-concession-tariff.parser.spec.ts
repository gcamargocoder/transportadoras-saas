import {
  normalizeAnttConcessionTariffs,
  parseAnttConcessionPlazaLocations,
  parseAnttConcessionTariffTable,
} from './antt-concession-tariff.parser';

// Fixture REAL, baixada via curl em 10/08/2026 de
// https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes/via-cristais/revisoes-e-reajustes/tarifas-de-pedagio
// -- recorte de 3 das 12 categorias reais (a tabela completa tem 12
// linhas de dado; aqui usamos as 3 primeiras, verbatim, incluindo o ruido
// de exportacao do Word que a propria ANTT publica). Cabecalho com P1..P7
// tambem 100% real.
const REAL_TARIFAS_HTML = `<table border="1" class="Table Ltr TableWordWrap SCXW14729107 BCX8" data-tablestyle="MsoNormalTable" data-tablelook="1184">
<tbody class="SCXW14729107 BCX8">
<tr class="TableRow SCXW14729107 BCX8">
<td class="FirstRow FirstCol SCXW14729107 BCX8" colspan="1" rowspan="2" data-celllook="69905">
<div class="TableCellContent SCXW14729107 BCX8">
<div class="OutlineElement Ltr SCXW14729107 BCX8">
<p class="Paragraph SCXW14729107 BCX8"><strong><span class="TextRun SCXW14729107 BCX8" data-contrast="none">Categoria</span></strong></p>
</div>
</div>
</td>
<td class="FirstRow SCXW14729107 BCX8" colspan="1" rowspan="2" data-celllook="69905">
<div class="TableCellContent SCXW14729107 BCX8">
<div class="OutlineElement Ltr SCXW14729107 BCX8">
<p class="Paragraph SCXW14729107 BCX8"><strong><span class="TextRun SCXW14729107 BCX8" data-contrast="none">Tipos de Veículos</span></strong></p>
</div>
</div>
</td>
<td class="FirstRow SCXW14729107 BCX8" colspan="1" rowspan="2" data-celllook="69905">
<div class="TableCellContent SCXW14729107 BCX8">
<div class="OutlineElement Ltr SCXW14729107 BCX8">
<p class="Paragraph SCXW14729107 BCX8"><strong><span class="TextRun SCXW14729107 BCX8" data-contrast="none">Número de Eixos</span></strong></p>
</div>
</div>
</td>
<td class="FirstRow SCXW14729107 BCX8" colspan="1" rowspan="2" data-celllook="69905">
<div class="TableCellContent SCXW14729107 BCX8">
<div class="OutlineElement Ltr SCXW14729107 BCX8">
<p class="Paragraph SCXW14729107 BCX8"><strong><span class="TextRun SCXW14729107 BCX8" data-contrast="none">Rodagem</span></strong></p>
</div>
</div>
</td>
<td class="FirstRow SCXW14729107 BCX8" colspan="1" rowspan="2" data-celllook="69905">
<div class="TableCellContent SCXW14729107 BCX8">
<div class="OutlineElement Ltr SCXW14729107 BCX8">
<p class="Paragraph SCXW14729107 BCX8"><strong><span class="TextRun SCXW14729107 BCX8" data-contrast="none">Multiplicador da Tarifa</span></strong></p>
</div>
</div>
</td>
<td class="FirstRow LastCol SCXW14729107 BCX8" colspan="7" data-celllook="69905">
<div class="TableCellContent SCXW14729107 BCX8">
<div class="OutlineElement Ltr SCXW14729107 BCX8">
<p class="Paragraph SCXW14729107 BCX8" style="text-align: center; "><strong><span class="TextRun SCXW14729107 BCX8" data-contrast="none">Valores (R$)</span></strong></p>
</div>
</div>
</td>
</tr>
<tr class="TableRow SCXW14729107 BCX8">
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span>P1</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span>P2</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span>P3</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span>P4</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span>P5</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span>P6</span></p></div></td>
<td class="LastCol SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span>P7</span></p></div></td>
</tr>
<tr class="TableRow SCXW14729107 BCX8">
<td class="FirstCol SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="none">1</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">Automóvel, caminhonete e furgão</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8" style="text-align: center; "><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">2</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">Simples</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">1,0</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">11,30</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">11,40</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">11,60</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">11,40</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">11,50</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">11,70</span></p></div></td>
<td class="LastCol SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">15,50</span></p></div></td>
</tr>
<tr class="TableRow SCXW14729107 BCX8">
<td class="FirstCol SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="none">2</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">Caminhão leve, ônibus, caminhão-trator e furgão</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8" style="text-align: center; "><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">2</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">Dupla</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">2,0</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">22,60</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">22,80</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">23,20</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">22,80</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">23,00</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">23,40</span></p></div></td>
<td class="LastCol SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">31,00</span></p></div></td>
</tr>
<tr class="TableRow SCXW14729107 BCX8">
<td class="FirstCol SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="none">3</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">Automóvel e caminhonete com semirreboque</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8" style="text-align: center; "><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">3</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">Simples</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">1,5</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">16,95</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">17,10</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">17,40</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">17,10</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">17,25</span></p></div></td>
<td class="SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">17,55</span></p></div></td>
<td class="LastCol SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">23,25</span></p></div></td>
</tr>
</tbody></table>`;

// Fixture REAL, baixada via curl em 10/08/2026 de
// https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes/via-cristais/revisoes-e-reajustes/localizacao-das-pracas-de-pedagio
// -- recorte de 3 das 7 pracas reais (P1..P3), verbatim.
const REAL_LOCATIONS_HTML = `<div id="parent-fieldname-text"><table align="left" border="1" cellpadding="0" cellspacing="0">
<tbody>
<tr>
<td width="87"><p style="text-align: center; ">PRAÇA DE PEDÁGIO</p></td>
<td width="67"><p>RODOVIA</p></td>
<td width="34"><p>UF</p></td>
<td width="55"><p>KM/M</p></td>
<td width="78"><p>MUNICÍPIO</p></td>
<td width="62"><p>TIPO DE PISTA</p></td>
<td width="147"><p>SENTIDO</p></td>
<td width="69"><p>LATITUDE</p></td>
<td width="81"><p style="text-align: center; ">LONGITUDE</p></td>
</tr>
<tr>
<td width="87"><p>P1 – PARACATU</p></td>
<td width="67"><p>BR-040</p></td>
<td width="34"><p>MG</p></td>
<td width="55"><p>17,65</p></td>
<td width="78"><p>Paracatu</p></td>
<td width="62"><p>Principal</p></td>
<td width="147"><p>Crescente/Decrescente</p></td>
<td width="69"><p>-17,0983</p></td>
<td width="81"><p>-47,0262</p></td>
</tr>
<tr>
<td width="87"><p>P2 – LAGOA GRANDE</p></td>
<td width="67"><p>BR-040</p></td>
<td width="34"><p>MG</p></td>
<td width="55"><p>91,295</p></td>
<td width="78"><p>Lagoa Grande</p></td>
<td width="62"><p>Principal</p></td>
<td width="147"><p>Crescente/Decrescente</p></td>
<td width="69"><p>-17,506</p></td>
<td width="81"><p>-46,5647</p></td>
</tr>
<tr>
<td width="87"><p>P3 - JOÃO PINHEIRO</p></td>
<td width="67"><p>BR-040</p></td>
<td width="34"><p>MG</p></td>
<td width="55"><p>172,985</p></td>
<td width="78"><p>João Pinheiro</p></td>
<td width="62"><p>Principal</p></td>
<td width="147"><p>Crescente/Decrescente</p></td>
<td width="69"><p>-17,9458</p></td>
<td width="81"><p>-46,0343</p></td>
</tr>
</tbody></table>`;

describe('parseAnttConcessionTariffTable (fixture real -- Via Cristais)', () => {
  it('extrai os rotulos de praca (P1..P7) e gera 1 linha por categoria x praca', () => {
    const rows = parseAnttConcessionTariffTable(REAL_TARIFAS_HTML);
    // 3 categorias x 7 pracas = 21 linhas.
    expect(rows).toHaveLength(21);
    expect(new Set(rows.map((r) => r.plazaLabel))).toEqual(new Set(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']));
  });

  it('categoria e numero de eixos sao extraidos corretamente', () => {
    const rows = parseAnttConcessionTariffTable(REAL_TARIFAS_HTML);
    const cat2P1 = rows.find((r) => r.category === 2 && r.plazaLabel === 'P1');
    expect(cat2P1?.axleCount).toBe(2);
    expect(cat2P1?.vehicleType).toBe('Caminhão leve, ônibus, caminhão-trator e furgão');
    expect(cat2P1?.wheelType).toBe('Dupla');
  });

  it('tarifa em formato decimal brasileiro (virgula) e convertida corretamente, nunca como milhar', () => {
    const rows = parseAnttConcessionTariffTable(REAL_TARIFAS_HTML);
    const cat1P7 = rows.find((r) => r.category === 1 && r.plazaLabel === 'P7');
    expect(cat1P7?.price).toBeCloseTo(15.5);
    const cat2P7 = rows.find((r) => r.category === 2 && r.plazaLabel === 'P7');
    expect(cat2P7?.price).toBeCloseTo(31.0);
    const cat1P1 = rows.find((r) => r.category === 1 && r.plazaLabel === 'P1');
    expect(cat1P1?.tariffMultiplier).toBeCloseTo(1.0);
  });

  it('multiplas categorias e multiplas pracas na mesma tabela sao todas capturadas, sem se misturar', () => {
    const rows = parseAnttConcessionTariffTable(REAL_TARIFAS_HTML);
    const categories = new Set(rows.map((r) => r.category));
    expect(categories).toEqual(new Set([1, 2, 3]));
    // cada praca de cada categoria tem um valor proprio (nao repete o de outra praca por engano).
    const cat3Prices = rows.filter((r) => r.category === 3).map((r) => r.price);
    expect(new Set(cat3Prices).size).toBeGreaterThan(1);
  });

  it('HTML inesperado (sem os marcadores "Categoria"/"Multiplicador") retorna lista vazia, nunca lanca excecao', () => {
    expect(parseAnttConcessionTariffTable('<html><body><p>pagina generica</p></body></html>')).toEqual([]);
  });

  it('conteudo vazio retorna lista vazia', () => {
    expect(parseAnttConcessionTariffTable('')).toEqual([]);
  });

  it('tabela ausente (0 tabelas na pagina) retorna lista vazia', () => {
    expect(parseAnttConcessionTariffTable('<div>Categoria Multiplicador mas sem nenhuma <table></div>')).toEqual([]);
  });

  it('linha de dado com numero de colunas incompativel com o cabecalho de pracas e ignorada, nunca alinhada errado', () => {
    const malformed = REAL_TARIFAS_HTML.replace('<td class="LastCol SCXW14729107 BCX8" data-celllook="69905"><div class="TableCellContent SCXW14729107 BCX8"><p class="Paragraph SCXW14729107 BCX8"><span class="TextRun SCXW14729107 BCX8" data-contrast="auto">15,50</span></p></div></td>\n</tr>', '</tr>');
    const rows = parseAnttConcessionTariffTable(malformed);
    // a linha da categoria 1 (agora com 1 coluna de valor a menos) e descartada inteira.
    expect(rows.some((r) => r.category === 1)).toBe(false);
    expect(rows.some((r) => r.category === 2)).toBe(true);
  });

  it('valor de tarifa invalido (texto nao numerico) vira null, nunca zero nem inventado', () => {
    const withInvalidPrice = REAL_TARIFAS_HTML.replace('11,30', 'sob consulta');
    const rows = parseAnttConcessionTariffTable(withInvalidPrice);
    const cat1P1 = rows.find((r) => r.category === 1 && r.plazaLabel === 'P1');
    expect(cat1P1?.price).toBeNull();
  });
});

describe('parseAnttConcessionPlazaLocations (fixture real -- Via Cristais)', () => {
  it('extrai rodovia/km/municipio/coordenadas reais por praca', () => {
    const locations = parseAnttConcessionPlazaLocations(REAL_LOCATIONS_HTML);
    expect(locations).toHaveLength(3);
    const p1 = locations.find((l) => l.plazaLabel === 'P1');
    expect(p1).toMatchObject({
      plazaName: 'PARACATU',
      highway: 'BR-040',
      state: 'MG',
      city: 'Paracatu',
    });
    expect(p1?.km).toBeCloseTo(17.65);
    expect(p1?.latitude).toBeCloseTo(-17.0983);
    expect(p1?.longitude).toBeCloseTo(-47.0262);
  });

  it('aceita tanto en-dash quanto hifen comum separando rotulo e nome da praca (inconsistencia real da fonte)', () => {
    const locations = parseAnttConcessionPlazaLocations(REAL_LOCATIONS_HTML);
    // P1/P2 usam en-dash (–) no fixture original, P3 foi salvo com hifen comum (-) -- ambos devem parsear.
    expect(locations.find((l) => l.plazaLabel === 'P3')?.plazaName).toBe('JOÃO PINHEIRO');
  });

  it('HTML sem os marcadores esperados (RODOVIA/MUNIC) retorna lista vazia', () => {
    expect(parseAnttConcessionPlazaLocations('<table><tr><td>nada aqui</td></tr></table>')).toEqual([]);
  });

  it('conteudo vazio retorna lista vazia, nunca lanca excecao', () => {
    expect(parseAnttConcessionPlazaLocations('')).toEqual([]);
  });
});

describe('normalizeAnttConcessionTariffs (combinacao das 2 paginas)', () => {
  it('combina tarifa + localizacao por rotulo de praca, produzindo axleCategory no formato "N eixos"', () => {
    const normalized = normalizeAnttConcessionTariffs(REAL_TARIFAS_HTML, REAL_LOCATIONS_HTML);
    const p1NineIsh = normalized.find((r) => r.plazaLabel === 'P1' && r.axleCategory === '2 eixos');
    expect(p1NineIsh).toBeUndefined(); // "2 eixos" e ambiguo nesta tabela (categorias 1 e 2) -- ver proximo teste.
  });

  it('numero de eixos ambiguo (mais de 1 categoria com o mesmo numero de eixos) e excluido inteiramente, nunca adivinhado', () => {
    const normalized = normalizeAnttConcessionTariffs(REAL_TARIFAS_HTML, REAL_LOCATIONS_HTML);
    // categorias 1 (2 eixos simples) e 2 (2 eixos dupla) colidem em "2 eixos" -- nenhuma das duas deve aparecer.
    expect(normalized.some((r) => r.axleCategory === '2 eixos')).toBe(false);
    // categoria 3 (3 eixos, simples) e a UNICA com 3 eixos nesta amostra -- deve aparecer normalmente.
    expect(normalized.some((r) => r.axleCategory === '3 eixos')).toBe(true);
  });

  it('praca presente na tabela de tarifas mas ausente na tabela de localizacao e descartada (nunca inventa coordenada/rodovia)', () => {
    const locationsWithoutP2 = REAL_LOCATIONS_HTML.replace(
      /<tr>\s*<td width="87"><p>P2[\s\S]*?<\/tr>/,
      '',
    );
    const normalized = normalizeAnttConcessionTariffs(REAL_TARIFAS_HTML, locationsWithoutP2);
    expect(normalized.some((r) => r.plazaLabel === 'P2')).toBe(false);
    expect(normalized.some((r) => r.plazaLabel === 'P1')).toBe(true);
  });

  it('registro final contem rodovia/km real para o matching (nunca null quando a fonte fornece o dado)', () => {
    const normalized = normalizeAnttConcessionTariffs(REAL_TARIFAS_HTML, REAL_LOCATIONS_HTML);
    const p1Cat3 = normalized.find((r) => r.plazaLabel === 'P1' && r.axleCategory === '3 eixos');
    expect(p1Cat3?.highway).toBe('BR-040');
    expect(p1Cat3?.km).toBeCloseTo(17.65);
    expect(p1Cat3?.price).toBeCloseTo(16.95);
    expect(p1Cat3?.currency).toBe('BRL');
  });
});
