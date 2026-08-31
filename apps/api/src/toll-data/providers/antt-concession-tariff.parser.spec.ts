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

  // Fase "Expansao ANTT" -- download AO VIVO (nao a fixture acima, capturada
  // na Fase 35) revelou que a mesma pagina de Via Cristais passou a publicar
  // o cabecalho de praca por extenso ("Praça 1".."Praça 7"), nunca mais
  // abreviado ("P1".."P7") -- confirmado byte-a-byte nesta fase. Verbatim da
  // fonte real (2 das 12 categorias reais).
  it('cabecalho de praca por extenso ("Praça 1".."Praça n") e reconhecido e normalizado para "P1".."Pn"', () => {
    const html = `<table>
<tr><td>Categoria de Veículo</td><td>Tipo de Veículo</td><td>Número de Eixos</td><td>Rodagem</td><td>Multiplicador da Tarifa</td><td colspan="7">Valores a serem Praticados (R$)</td></tr>
<tr><td>Praça 1</td><td>Praça 2</td><td>Praça 3</td><td>Praça 4</td><td>Praça 5</td><td>Praça 6</td><td>Praça 7</td></tr>
<tr><td>1</td><td>Automóvel, caminhonete e furgão</td><td>2</td><td>Simples</td><td>1</td><td>12,10</td><td>12,20</td><td>12,40</td><td>12,20</td><td>12,30</td><td>12,50</td><td>16,60</td></tr>
<tr><td>2</td><td>Caminhão leve, ônibus, caminhão-trator e furgão</td><td>2</td><td>Dupla</td><td>2</td><td>24,20</td><td>24,40</td><td>24,80</td><td>24,40</td><td>24,60</td><td>25,00</td><td>33,20</td></tr>
</table>`;
    const rows = parseAnttConcessionTariffTable(html);
    expect(rows).toHaveLength(14); // 2 categorias x 7 pracas
    expect(new Set(rows.map((r) => r.plazaLabel))).toEqual(new Set(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']));
    const cat1P1 = rows.find((r) => r.category === 1 && r.plazaLabel === 'P1');
    expect(cat1P1?.price).toBeCloseTo(12.1);
  });

  it('celula de cabecalho de praca que nao bate com nenhum dos 2 formatos reconhecidos descarta a tabela inteira (nunca adivinha o rotulo)', () => {
    const html = `<table>
<tr><td>Categoria</td><td>Tipo</td><td>Eixos</td><td>Rodagem</td><td>Multiplicador</td><td colspan="2">Valores</td></tr>
<tr><td>P1</td><td>Praca desconhecida</td></tr>
<tr><td>1</td><td>Automovel</td><td>2</td><td>Simples</td><td>1</td><td>10,00</td><td>20,00</td></tr>
</table>`;
    expect(parseAnttConcessionTariffTable(html)).toEqual([]);
  });

  // Fase "Expansao ANTT" -- download AO VIVO de Via 040 e Autopista Régis
  // Bittencourt revelou concessoes que publicam UM UNICO valor por
  // categoria, valido para TODAS as pracas (nunca uma coluna por praca) --
  // confirmado byte-a-byte nesta fase. Verbatim de Via 040 (10 das 10
  // categorias reais, aqui recortado para 3).
  describe('modo uniforme (1 valor por categoria, sem coluna por praca)', () => {
    const REAL_UNIFORM_HTML = `<table>
<tr><th scope="col">Categoria de Veículo</th><th scope="col">Tipo de Veículo</th><th scope="col">Número de Eixos</th><th scope="col">Rodagem</th><th scope="col">Multiplicador da Tarifa</th><th scope="col">Valores a serem Praticados</th></tr>
<tr><td>1</td><td>Automóvel, caminhonete e furgão</td><td>2</td><td>Simples</td><td>1,0</td><td>6,30</td></tr>
<tr><td>2</td><td>Caminhão leve, Ônibus, caminhão-trator e furgão</td><td>2</td><td>Dupla</td><td>2,0</td><td>12,60</td></tr>
<tr><td>3</td><td>Automóvel e caminhonete com semirreboque</td><td>3</td><td>Simples</td><td>1,5</td><td>9,45</td></tr>
</table>`;

    it('reconhece cabecalho em <th> (HTML semantico) e gera 1 linha por categoria com plazaLabel null', () => {
      const rows = parseAnttConcessionTariffTable(REAL_UNIFORM_HTML);
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.plazaLabel === null)).toBe(true);
      const cat1 = rows.find((r) => r.category === 1);
      expect(cat1).toMatchObject({ vehicleType: 'Automóvel, caminhonete e furgão', axleCount: 2, wheelType: 'Simples', price: 6.3 });
    });

    it('normalizeAnttConcessionTariffs emite highway/km/city/lat/long todos null (mesmo significado de RJ_AGETRANSP: tarifa uniforme, nunca localizacao inventada)', () => {
      const normalized = normalizeAnttConcessionTariffs(REAL_UNIFORM_HTML, '<table><tr><td>RODOVIA</td><td>MUNIC</td></tr></table>');
      // Categorias 1 e 2 tem o MESMO numero de eixos (2, so difere por
      // Rodagem Simples/Dupla) -- mesma regra de ambiguidade ja aplicada ao
      // modo multi-praca (ver describe acima) tambem vale aqui, entao so a
      // categoria 3 (3 eixos, unica) sobrevive.
      expect(normalized).toHaveLength(1);
      const row = normalized[0]!;
      expect(row.plazaLabel).toBeNull();
      expect(row.highway).toBeNull();
      expect(row.km).toBeNull();
      expect(row.city).toBeNull();
      expect(row.latitude).toBeNull();
      expect(row.longitude).toBeNull();
      expect(row.axleCategory).toBe('3 eixos');
      expect(row.price).toBeCloseTo(9.45);
    });

    it('linha de dado com numero de colunas diferente de 6 e ignorada (nunca alinhada "na marra")', () => {
      const withExtraColumn = REAL_UNIFORM_HTML.replace('<td>6,30</td>', '<td>6,30</td><td>extra</td>');
      const rows = parseAnttConcessionTariffTable(withExtraColumn);
      expect(rows.some((r) => r.category === 1)).toBe(false);
      expect(rows.some((r) => r.category === 2)).toBe(true);
    });

    // Fase "Expansao ANTT" -- download AO VIVO de Rodovia do Aço revelou
    // uma concessao que NAO publica a coluna "Rodagem" -- confirmado
    // byte-a-byte. wheelType deve ficar null (nunca "Simples"/"Dupla"
    // inventado), nunca deslocando Multiplicador/Valores para a coluna
    // errada.
    it('sem coluna "Rodagem" (confirmado pelo cabecalho real) -- wheelType fica null, nunca inventado', () => {
      const html = `<table>
<tr><td>Categoria de Veículo</td><td>Tipo de Veículo</td><td>Nº de Eixos</td><td>Multiplicador da Tarifa</td><td>Valores a serem Praticados*</td></tr>
<tr><td>1</td><td>Automóvel, caminhonete e furgão</td><td>2</td><td>1</td><td>6,50</td></tr>
<tr><td>2</td><td>Caminhão leve, ônibus, caminhão-trator e furgão</td><td>2</td><td>2</td><td>13,00</td></tr>
<tr><td>3</td><td>Automóvel e caminhonete com semi-reboque</td><td>3</td><td>1,5</td><td>9,75</td></tr>
</table>`;
      const rows = parseAnttConcessionTariffTable(html);
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.wheelType === null)).toBe(true);
      const cat3 = rows.find((r) => r.category === 3);
      expect(cat3).toMatchObject({ vehicleType: 'Automóvel e caminhonete com semi-reboque', axleCount: 3, wheelType: null, price: 9.75, plazaLabel: null });
    });
  });

  // Fase "Recuperacao ANTT" -- fixture REAL, baixada em 30/08/2026 de
  // .../lista-de-concessoes/ecosul-contrato-encerrado/tarifas-de-pedagio
  // -- concessao SEM coluna "Multiplicador": o valor final ja vem pronto
  // na ultima coluna ("Valores a serem Praticados (R$)"). 8 categorias
  // reais, verbatim (so a formatacao de indentacao foi normalizada).
  describe('modo valor direto, sem coluna Multiplicador (fixture real -- Ecosul, contrato encerrado)', () => {
    const REAL_DIRECT_VALUE_HTML = `<table>
<tbody>
<tr><td><p><span>Categoria de Veículo</span></p></td><td><p><span>Tipo de Veículo</span></p></td><td><p><span>Número de Eixos</span></p></td><td><p><span>Rodagem</span></p></td><td><p><span>Valores a serem Praticados (R$)</span></p></td></tr>
<tr><td><p>1</p></td><td><p>Automóvel, caminhonete e furgão</p></td><td><p>2</p></td><td><p>Simples</p></td><td><p><span>19,60</span></p></td></tr>
<tr><td><p>2</p></td><td><p>Caminhão leve, ônibus, caminhão-trator e furgão</p></td><td><p>2</p></td><td><p>Dupla</p></td><td><p><span>39,10</span></p></td></tr>
<tr><td><p>5</p></td><td><p>Caminhão com reboque e caminhão-trator com semi-reboque</p></td><td><p>5</p></td><td><p>Dupla</p></td><td><p><span>97,80</span></p></td></tr>
<tr><td><p>6</p></td><td><p>Caminhão com reboque e caminhão-trator com semi-reboque</p></td><td><p>6</p></td><td><p>Dupla</p></td><td><p><span>117,40</span></p></td></tr>
</tbody>
</table>`;

    it('reconhece a tabela sem "Multiplicador" pelo cabecalho "Valores a serem Praticados" e extrai o valor final direto', () => {
      const rows = parseAnttConcessionTariffTable(REAL_DIRECT_VALUE_HTML);
      expect(rows).toHaveLength(4);
      expect(rows.every((r) => r.plazaLabel === null)).toBe(true);
      expect(rows.every((r) => r.tariffMultiplier === null)).toBe(true);
      const cat1 = rows.find((r) => r.category === 1);
      expect(cat1).toMatchObject({ vehicleType: 'Automóvel, caminhonete e furgão', axleCount: 2, wheelType: 'Simples', price: 19.6 });
    });

    it('nunca tenta o modo Multiplicador quando a tabela ja foi encontrada pelo caminho de valor direto (sem competir/colidir)', () => {
      // Confirma que uma fonte SEM "Multiplicador" nunca cai no branch
      // errado (que exigiria uma coluna a mais e rejeitaria a linha toda).
      const rows = parseAnttConcessionTariffTable(REAL_DIRECT_VALUE_HTML);
      expect(rows.map((r) => r.price)).toEqual([19.6, 39.1, 97.8, 117.4]);
    });

    it('normalizeAnttConcessionTariffs trata como modo uniforme (highway/km/city/lat/long null) e aplica a mesma regra de ambiguidade de eixos', () => {
      const normalized = normalizeAnttConcessionTariffs(
        REAL_DIRECT_VALUE_HTML,
        '<table><tr><td>RODOVIA</td><td>MUNIC</td></tr></table>',
      );
      // Categorias 1 e 2 tem o mesmo numero de eixos (2) -- excluidas por
      // ambiguidade, mesma regra ja usada nos outros modos. So 5 e 6 eixos
      // sobrevivem (cada um aparece em exatamente 1 categoria).
      expect(normalized).toHaveLength(2);
      expect(normalized.map((r) => r.axleCategory).sort()).toEqual(['5 eixos', '6 eixos']);
      expect(normalized.every((r) => r.plazaLabel === null && r.highway === null)).toBe(true);
    });
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

  // Fase "Expansao ANTT" -- download AO VIVO de Autopista Fluminense
  // revelou zero a esquerda no rotulo ("P01"), nunca visto na fixture de
  // Via Cristais (Fase 35, sempre "P1"). Confirmado byte-a-byte nesta fase.
  it('rotulo com zero a esquerda ("P01") e normalizado para a mesma forma ("P1")', () => {
    const html = `<table><tr><td>PRAÇA DE PEDÁGIO</td><td>RODOVIA</td><td>UF</td><td>KM/M</td><td>MUNICÍPIO</td><td>TIPO DE PISTA</td><td>SENTIDO</td><td>LATITUDE</td><td>LONGITUDE</td></tr>
<tr><td>P01 - Casimiro de Abreu</td><td>BR-101</td><td>RJ</td><td>192,82</td><td>Casimiro de Abreu</td><td>Principal</td><td>Crescente/Decrescente</td><td>-22,476441</td><td>-42,088519</td></tr>
</table>`;
    const locations = parseAnttConcessionPlazaLocations(html);
    expect(locations).toHaveLength(1);
    expect(locations[0]?.plazaLabel).toBe('P1');
  });

  // Fase "Expansao ANTT" -- download AO VIVO de Concebra revelou rotulo sem
  // NENHUM separador entre numero e nome, so espaco ("P1 ALEXÂNIA") --
  // confirmado byte-a-byte nesta fase, distinto do en-dash/hifen ja
  // cobertos acima.
  it('rotulo sem separador (so espaco: "P1 ALEXÂNIA") e reconhecido normalmente', () => {
    const html = `<table><tr><td>PRAÇA DE PEDÁGIO</td><td>RODOVIA</td><td>UF</td><td>KM/M</td><td>MUNICÍPIO</td><td>TIPO DE PISTA</td><td>SENTIDO</td><td>LATITUDE</td><td>LONGITUDE</td></tr>
<tr><td>P1 ALEXÂNIA</td><td>BR-060</td><td>GO</td><td>43,1</td><td>Alexânia</td><td>Principal</td><td>Crescente/Decrescente</td><td>-16,1157</td><td>-48,5892</td></tr>
</table>`;
    const locations = parseAnttConcessionPlazaLocations(html);
    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({ plazaLabel: 'P1', plazaName: 'ALEXÂNIA', highway: 'BR-060' });
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

  // Fase "Expansao ANTT" -- caso real (Autopista Fluminense): a pagina de
  // tarifas usa "P1" (sem zero a esquerda) e a pagina de localizacao da
  // MESMA concessao usa "P01" (com zero a esquerda) -- sem normalizar os
  // dois lados para a mesma forma, esta combinacao nunca encontraria a
  // localizacao (comparacao de string exata) e a concessao inteira seria
  // rejeitada por engano, mesmo com as 2 paginas estruturalmente validas.
  it('combina corretamente quando a pagina de tarifas usa "P1" e a de localizacao usa "P01" (zero a esquerda so de um lado)', () => {
    const tariffHtml = `<table>
<tr><td>Categoria</td><td>Tipo</td><td>Eixos</td><td>Rodagem</td><td>Multiplicador</td><td>Valores</td></tr>
<tr><td>P1</td></tr>
<tr><td>1</td><td>Automovel</td><td>2</td><td>Simples</td><td>1</td><td>7,50</td></tr>
</table>`;
    const locationHtml = `<table><tr><td>PRAÇA DE PEDÁGIO</td><td>RODOVIA</td><td>UF</td><td>KM/M</td><td>MUNICÍPIO</td><td>TIPO DE PISTA</td><td>SENTIDO</td><td>LATITUDE</td><td>LONGITUDE</td></tr>
<tr><td>P01 - Casimiro de Abreu</td><td>BR-101</td><td>RJ</td><td>192,82</td><td>Casimiro de Abreu</td><td>Principal</td><td>Crescente/Decrescente</td><td>-22,476441</td><td>-42,088519</td></tr>
</table>`;
    const normalized = normalizeAnttConcessionTariffs(tariffHtml, locationHtml);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({ plazaLabel: 'P1', highway: 'BR-101', city: 'Casimiro de Abreu', price: 7.5 });
  });
});
