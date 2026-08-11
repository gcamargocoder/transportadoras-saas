import {
  normalizeRjAgetranspTariffs,
  parseRjAgetranspTariffTable,
  parseRjAgetranspVigencia,
} from './rj-agetransp-tariff.parser';

// Fixture REAL, baixada via curl em 10/08/2026 (Fase 36, revalidacao da
// descoberta da Fase 34) de
// https://www.agetransp.rj.gov.br/concessionarias/vialagos -- verbatim,
// incluindo a tabela completa de 8 categorias e o bloco de vigencia
// (data + link da deliberacao) exatamente como a AGETRANSP publica.
const REAL_VIALAGOS_HTML = `<table class="table table-hover table-sm table-responsive">
    <thead class="table-light">
    <tr>
        <th><strong>VEÍCULO</strong></th>
        <th><strong>EIXOS</strong></th>
        <th><strong>MULT. TARIFA</strong></th>
        <th><strong>DIAS ÚTEIS</strong></th>
        <th><strong>SÁB. DOM. E FERIADOS</strong></th>
    </tr>
    </thead>
    <tbody class="border-bottom border-grey">
    <tr>
        <td>Motocicletas, motonetas e bicicletas a motor</td>
        <td>2 eixos simples</td>
        <td class="text-center">0,5</td>
        <td>R$ 9,20</td>
        <td class="text-start">R$ 15,30</td>
    </tr>
    <tr>
        <td>Automóvel, Caminhonete e Furgão</td>
        <td>2 eixos simples</td>
        <td class="text-center">1</td>
        <td>R$ 18,40</td>
        <td class="text-start">R$ 30,60</td>
    </tr>
    <tr>
        <td>Caminhão Leve, Ônibus, Caminhão Trator e Furgão</td>
        <td>2 eixos dupla</td>
        <td class="text-center">2</td>
        <td>R$ 36,80</td>
        <td class="text-start">R$ 61,20</td>
    </tr>
    <tr>
        <td>Automóvel com Semirreboque e Caminhonete com Semirreboque</td>
        <td>3 eixos simples</td>
        <td class="text-center">1,5</td>
        <td>R$ 27,60</td>
        <td class="text-start">R$ 45,90</td>
    </tr>
    <tr>
        <td>Caminhão, Caminhão Trator, Caminhão Trator com Semi-reboque e Ônibus</td>
        <td>3 eixos dupla</td>
        <td class="text-center">3</td>
        <td>R$ 55,20</td>
        <td class="text-start">R$ 91,80</td>
    </tr>
    <tr>
        <td>Automóvel com Reboque e Caminhonete com Reboque</td>
        <td>4 eixos simples</td>
        <td class="text-center">2</td>
        <td>R$ 36,80</td>
        <td class="text-start">R$ 61,20</td>
    </tr>
    <tr>
        <td>Caminhão com Reboque e Caminhão com Semi-reboque</td>
        <td>4 eixos dupla</td>
        <td class="text-center">4</td>
        <td>R$ 73,60</td>
        <td class="text-start">R$ 122,40</td>
    </tr>
    <tr>
        <td></td>
        <td>5 eixos dupla</td>
        <td class="text-center">5</td>
        <td>R$ 92,00</td>
        <td class="text-start">R$ 153,00</td>
    </tr>
    <tr>
        <td></td>
        <td>6 eixos dupla</td>
        <td class="text-center">6</td>
        <td>R$ 110,40</td>
        <td class="text-start">R$ 183,60</td>
    </tr>
    </tbody>
</table>
<small>Fonte : AGETRANSP/ CAPET: Agência Reguladora de Transportes Públicos do Estado do Rio de
    Janeiro, Câmara de Política Econômica e Tarifária.</small>
<p>
    <small>
        Tarifa em R$<br>
        Cobrança praticada a partir de 01/08/2025.<br>
        <a href="https://www.agetransp.rj.gov.br/atos-normativos/deliberacoes/numero/1630/visualizar"
           target="_blank"
           aria-label="Visualizar o normativo que homologou a tarifa">
            <i class="bi bi-eye-fill"></i> Deliberação N. 1630 de 29 de July de 2025
        </a>
        <br>
        <a aria-label="Baixar a nota técnica tarifária"
           href="https://www.agetransp.rj.gov.br/notas-tecnicas/concessionaria/ccr-via-lagos/numero/015-2025"
           target="_blank">
            <i class="fa fa-download"></i> Nota Técnica nº 015/2025
        </a>
        <br>
    </small>
</p>`;

describe('parseRjAgetranspTariffTable (fixture real -- Via Lagos)', () => {
  it('extrai as 9 linhas de categoria reais, com eixos/rodagem/multiplicador/tarifa de dia util', () => {
    const rows = parseRjAgetranspTariffTable(REAL_VIALAGOS_HTML);
    expect(rows).toHaveLength(9);
  });

  it('separa numero de eixos e rodagem da mesma celula ("2 eixos simples" -> 2 + simples)', () => {
    const rows = parseRjAgetranspTariffTable(REAL_VIALAGOS_HTML);
    const caminhaoLeve = rows.find((r) => r.vehicleType.includes('Caminhão Leve'));
    expect(caminhaoLeve?.axleCount).toBe(2);
    expect(caminhaoLeve?.wheelType).toBe('dupla');
  });

  it('tarifa em real (com prefixo "R$") e formato decimal brasileiro sao convertidos corretamente', () => {
    const rows = parseRjAgetranspTariffTable(REAL_VIALAGOS_HTML);
    const seisEixos = rows.find((r) => r.axleCount === 6);
    expect(seisEixos?.weekdayPrice).toBeCloseTo(110.4);
    expect(seisEixos?.tariffMultiplier).toBeCloseTo(6);
  });

  it('multiplas categorias sao todas capturadas com o valor correto, sem se misturar', () => {
    const rows = parseRjAgetranspTariffTable(REAL_VIALAGOS_HTML);
    // R$36,80 se repete legitimamente na fonte real (2 eixos dupla E 4
    // eixos simples tem o mesmo multiplicador, 2) -- confirma que cada
    // linha tem o valor certo (nunca que os 9 valores sejam distintos).
    const caminhaoLeve = rows.find((r) => r.vehicleType.includes('Caminhão Leve'));
    const autoComReboque = rows.find((r) => r.vehicleType.includes('Automóvel com Reboque'));
    expect(caminhaoLeve?.weekdayPrice).toBeCloseTo(36.8);
    expect(autoComReboque?.weekdayPrice).toBeCloseTo(36.8);
    expect(caminhaoLeve?.axleCount).toBe(2);
    expect(autoComReboque?.axleCount).toBe(4);
    // 8 valores UNICOS entre as 9 linhas (so essa coincidencia real).
    expect(new Set(rows.map((r) => r.weekdayPrice)).size).toBe(8);
  });

  it('HTML sem os marcadores esperados (EIXOS/MULT) retorna lista vazia, nunca lanca excecao', () => {
    expect(parseRjAgetranspTariffTable('<html><body>pagina generica</body></html>')).toEqual([]);
  });

  it('tabela inexistente (0 tabelas na pagina) retorna lista vazia', () => {
    expect(parseRjAgetranspTariffTable('<div>EIXOS MULT mas sem nenhuma table</div>')).toEqual([]);
  });

  it('conteudo vazio retorna lista vazia', () => {
    expect(parseRjAgetranspTariffTable('')).toEqual([]);
  });

  it('tarifa invalida (texto nao numerico) vira null, nunca zero nem inventada', () => {
    const withInvalid = REAL_VIALAGOS_HTML.replace('R$ 9,20', 'sob consulta');
    const rows = parseRjAgetranspTariffTable(withInvalid);
    const moto = rows.find((r) => r.vehicleType.includes('Motocicletas'));
    expect(moto?.weekdayPrice).toBeNull();
  });

  it('celula de eixos fora do padrao esperado ("EIXOS" sem numero) e ignorada, nunca adivinhada', () => {
    const malformed = REAL_VIALAGOS_HTML.replace('<td>2 eixos simples</td>\n        <td class="text-center">0,5</td>', '<td>sem eixo definido</td>\n        <td class="text-center">0,5</td>');
    const rows = parseRjAgetranspTariffTable(malformed);
    expect(rows.some((r) => r.vehicleType.includes('Motocicletas'))).toBe(false);
    expect(rows).toHaveLength(8);
  });
});

describe('parseRjAgetranspVigencia (fixture real)', () => {
  it('extrai a vigencia legal explicita ("Cobranca praticada a partir de") como data real', () => {
    const vigencia = parseRjAgetranspVigencia(REAL_VIALAGOS_HTML);
    expect(vigencia.effectiveFrom).toEqual(new Date(Date.UTC(2025, 7, 1))); // 01/08/2025.
  });

  it('extrai o numero da deliberacao a partir do link (nunca do texto misto PT/EN visivel)', () => {
    const vigencia = parseRjAgetranspVigencia(REAL_VIALAGOS_HTML);
    expect(vigencia.deliberationNumber).toBe('1630');
    expect(vigencia.deliberationUrl).toBe('https://www.agetransp.rj.gov.br/atos-normativos/deliberacoes/numero/1630/visualizar');
  });

  it('sem o texto de vigencia, devolve tudo null -- nunca inventa uma data', () => {
    const vigencia = parseRjAgetranspVigencia('<html><body>pagina sem vigencia</body></html>');
    expect(vigencia.effectiveFrom).toBeNull();
    expect(vigencia.deliberationNumber).toBeNull();
    expect(vigencia.deliberationUrl).toBeNull();
  });
});

describe('normalizeRjAgetranspTariffs (combinacao tabela + vigencia)', () => {
  it('numero de eixos ambiguo (2+ categorias de veiculo com o mesmo numero de eixos) e excluido inteiramente', () => {
    const normalized = normalizeRjAgetranspTariffs(REAL_VIALAGOS_HTML);
    // 2, 3 e 4 eixos tem categorias "simples" E "dupla" com PRECOS
    // DIFERENTES (ex: moto R$9,20 vs automovel R$18,40, ambos "2 eixos
    // simples") -- axleCategory "2/3/4 eixos" sozinha nao identifica qual
    // vale, entao NUNCA aparece no resultado normalizado.
    expect(normalized.some((r) => r.axleCategory === '2 eixos')).toBe(false);
    expect(normalized.some((r) => r.axleCategory === '3 eixos')).toBe(false);
    expect(normalized.some((r) => r.axleCategory === '4 eixos')).toBe(false);
  });

  it('numeros de eixos com uma unica categoria (5 e 6 eixos) aparecem normalizados corretamente', () => {
    const normalized = normalizeRjAgetranspTariffs(REAL_VIALAGOS_HTML);
    const cinco = normalized.find((r) => r.axleCategory === '5 eixos');
    const seis = normalized.find((r) => r.axleCategory === '6 eixos');
    expect(cinco?.price).toBeCloseTo(92.0);
    expect(seis?.price).toBeCloseTo(110.4);
  });

  it('cada registro normalizado carrega a vigencia legal real e a referencia da deliberacao (nunca a data de coleta)', () => {
    const normalized = normalizeRjAgetranspTariffs(REAL_VIALAGOS_HTML);
    const seis = normalized.find((r) => r.axleCategory === '6 eixos');
    expect(seis?.effectiveFrom).toEqual(new Date(Date.UTC(2025, 7, 1)));
    expect(seis?.sourceDocument).toBe('Deliberacao AGETRANSP no. 1630');
    expect(seis?.sourceReference).toContain('numero/1630');
    expect(seis?.currency).toBe('BRL');
  });

  it('pagina sem nenhuma estrutura reconhecivel produz lista vazia, nunca lanca excecao', () => {
    expect(normalizeRjAgetranspTariffs('<html></html>')).toEqual([]);
  });
});
