import { AnttConcessionTollDataProvider } from './antt-concession-tariff.provider';
import { ANTT_CONCESSIONS, AnttConcessionConfig, buildAnttPlazaLocationsUrl, buildAnttTariffsUrl } from './antt-concessions.config';

// Mesmo padrao de antt-toll-data.provider.spec.ts / google.provider.spec.ts:
// mocka global.fetch na fronteira HTTP, exercitando a logica real de
// retry/timeout/validacao (nunca a rede real da ANTT em teste automatizado).
//
// Fase "Expansao ANTT" -- ANTT_CONCESSIONS aqui e mockado para 1 unico item
// (nunca a lista real de 27, que so a Fase "Expansao ANTT" adicionou):
// estes testes verificam o comportamento do provider POR concessao (retry,
// isolamento de falha, validacao de estrutura) -- nunca quantas concessoes
// existem em producao. Sem isso, os 500ms de INTER_CONCESSION_DELAY_MS entre
// cada uma das 27 concessoes reais estourariam o timeout padrao do Jest.
const CONCESSION = ANTT_CONCESSIONS[0]!;
const TARIFFS_URL = buildAnttTariffsUrl(CONCESSION);
const LOCATIONS_URL = buildAnttPlazaLocationsUrl(CONCESSION);

jest.mock('./antt-concessions.config', () => {
  const actual = jest.requireActual('./antt-concessions.config');
  return { ...actual, ANTT_CONCESSIONS: [actual.ANTT_CONCESSIONS[0] as AnttConcessionConfig] };
});

// HTML minimo, porem estruturalmente valido (mesmos marcadores exigidos
// pelo parser real), o suficiente para produzir >=1 tarifa normalizada --
// o foco aqui e o comportamento de rede do provider, nao o parser (ja
// coberto com fixture real em antt-concession-tariff.parser.spec.ts).
function buildValidTariffsHtml(): string {
  return `<table><tr><td>Categoria</td><td>Tipo</td><td>Numero de Eixos</td><td>Rodagem</td><td>Multiplicador da Tarifa</td><td colspan="1">Valores</td></tr>
<tr><td>P1</td></tr>
<tr><td>1</td><td>Caminhao</td><td>9</td><td>Dupla</td><td>4,5</td><td>50,00</td></tr>
</table>`.padEnd(2_500, ' <!-- padding para ultrapassar o tamanho minimo aceito -->');
}

function buildValidLocationsHtml(): string {
  return `<table><tr><td>PRACA DE PEDAGIO</td><td>RODOVIA</td><td>UF</td><td>KM/M</td><td>MUNICIPIO</td><td>TIPO DE PISTA</td><td>SENTIDO</td><td>LATITUDE</td><td>LONGITUDE</td></tr>
<tr><td>P1 - CIDADE TESTE</td><td>BR-000</td><td>SP</td><td>10,0</td><td>Cidade Teste</td><td>Principal</td><td>Crescente</td><td>-23,0</td><td>-46,0</td></tr>
</table>`.padEnd(2_500, ' <!-- padding para ultrapassar o tamanho minimo aceito -->');
}

function mockFetchByUrl(handlers: Record<string, () => Promise<{ ok: boolean; status?: number; arrayBuffer: () => Promise<ArrayBuffer> }>>) {
  return jest.fn(async (url: string) => {
    const handler = handlers[url];
    if (!handler) throw new Error(`URL inesperada no teste: ${url}`);
    return handler();
  });
}

// Buffer.from() para strings curtas usa um pool interno do Node -- .buffer
// sozinho devolve o ArrayBuffer inteiro do pool (milhares de bytes),
// nao so o conteudo real. Precisa fatiar por byteOffset/byteLength, senao
// um teste de "resposta pequena" nunca fica realmente pequeno.
function toArrayBuffer(text: string): ArrayBuffer {
  const buf = Buffer.from(text, 'utf-8');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('AnttConcessionTollDataProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('isAvailable() e sempre true -- fonte publica, sem chave/configuracao', () => {
    expect(new AnttConcessionTollDataProvider().isAvailable()).toBe(true);
  });

  it('baixa as 2 paginas da concessao configurada e normaliza tarifas com sucesso', async () => {
    const fetchSpy = mockFetchByUrl({
      [TARIFFS_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(buildValidTariffsHtml()) }),
      [LOCATIONS_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(buildValidLocationsHtml()) }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new AnttConcessionTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(result.failedConcessions).toHaveLength(0);
    expect(result.tariffs.length).toBeGreaterThan(0);
    expect(result.tariffs[0]).toMatchObject({
      concessionaire: CONCESSION.name,
      axleCategory: '9 eixos',
      price: 50,
      sourceReference: TARIFFS_URL,
    });
    expect(fetchSpy).toHaveBeenCalledWith(TARIFFS_URL, expect.objectContaining({ headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('TransportadorasSaaS') }) }));
  });

  it('tenta novamente (retry) apos falha transitoria e tem sucesso na segunda tentativa', async () => {
    let tariffsCalls = 0;
    const fetchSpy = jest.fn(async (url: string) => {
      if (url === TARIFFS_URL) {
        tariffsCalls += 1;
        if (tariffsCalls === 1) throw new Error('ECONNRESET');
        return { ok: true, arrayBuffer: async () => toArrayBuffer(buildValidTariffsHtml()) };
      }
      if (url === LOCATIONS_URL) {
        return { ok: true, arrayBuffer: async () => toArrayBuffer(buildValidLocationsHtml()) };
      }
      throw new Error(`URL inesperada: ${url}`);
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new AnttConcessionTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(tariffsCalls).toBe(2);
    expect(result.failedConcessions).toHaveLength(0);
    expect(result.tariffs.length).toBeGreaterThan(0);
  });

  it('desiste apos esgotar as tentativas e reporta a concessao em failedConcessions, sem lancar excecao para as demais', async () => {
    const fetchSpy = jest.fn(async () => {
      throw new Error('ECONNRESET');
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new AnttConcessionTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(result.tariffs).toHaveLength(0);
    expect(result.failedConcessions).toHaveLength(1);
    expect(result.failedConcessions[0]!.name).toBe(CONCESSION.name);
  });

  it('HTTP nao-ok (403/404/503) e tratado como falha da concessao, nunca interpretado como pagina valida', async () => {
    const fetchSpy = mockFetchByUrl({
      [TARIFFS_URL]: async () => ({ ok: false, status: 403, arrayBuffer: async () => toArrayBuffer('') }),
      [LOCATIONS_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(buildValidLocationsHtml()) }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new AnttConcessionTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(result.tariffs).toHaveLength(0);
    expect(result.failedConcessions[0]!.reason).toContain('403');
  });

  it('resposta suspeita menor que o minimo esperado e rejeitada (nunca interpretada como pagina real vazia)', async () => {
    const fetchSpy = mockFetchByUrl({
      [TARIFFS_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer('<html>pagina de erro curta</html>') }),
      [LOCATIONS_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(buildValidLocationsHtml()) }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new AnttConcessionTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(result.tariffs).toHaveLength(0);
    expect(result.failedConcessions).toHaveLength(1);
  });

  it('paginas baixadas com sucesso mas sem nenhuma estrutura reconhecivel viram falha da concessao (estrutura mudou), nunca "zero tarifas" silencioso', async () => {
    const unrecognizable = '<html><body>pagina generica sem tabela</body></html>'.padEnd(2_500, ' ');
    const fetchSpy = mockFetchByUrl({
      [TARIFFS_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(unrecognizable) }),
      [LOCATIONS_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(buildValidLocationsHtml()) }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new AnttConcessionTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(result.tariffs).toHaveLength(0);
    expect(result.failedConcessions).toHaveLength(1);
    expect(result.failedConcessions[0]!.reason).toContain('nao reconhecida');
  });
});
