import { RjAgetranspTollDataProvider } from './rj-agetransp-tariff.provider';
import { buildRjAgetranspTariffUrl, RJ_AGETRANSP_CONCESSIONS } from './rj-agetransp-concessions.config';

// Mesmo padrao de antt-concession-tariff.provider.spec.ts: mocka
// global.fetch na fronteira HTTP, exercitando a logica real de
// retry/timeout/validacao (nunca a rede real da AGETRANSP em teste
// automatizado).
const VIA_LAGOS = RJ_AGETRANSP_CONCESSIONS[0]!;
const ROTA_116 = RJ_AGETRANSP_CONCESSIONS[1]!;
const VIA_LAGOS_URL = buildRjAgetranspTariffUrl(VIA_LAGOS);
const ROTA_116_URL = buildRjAgetranspTariffUrl(ROTA_116);

function buildValidHtml(price = '92,00', deliberationNumber = '1630'): string {
  return `<table><tr><th>VEÍCULO</th><th>EIXOS</th><th>MULT. TARIFA</th><th>DIAS ÚTEIS</th></tr>
<tr><td></td><td>5 eixos dupla</td><td>5</td><td>R$ ${price}</td></tr>
</table>
Cobrança praticada a partir de 01/08/2025.
<a href="https://www.agetransp.rj.gov.br/atos-normativos/deliberacoes/numero/${deliberationNumber}/visualizar">Deliberação N. ${deliberationNumber}</a>`.padEnd(
    2_500,
    ' <!-- padding para ultrapassar o tamanho minimo aceito -->',
  );
}

// Buffer.from() para strings curtas usa um pool interno do Node -- .buffer
// sozinho devolve o ArrayBuffer inteiro do pool, nao so o conteudo real.
// Precisa fatiar por byteOffset/byteLength (mesmo cuidado de
// antt-concession-tariff.provider.spec.ts).
function toArrayBuffer(text: string): ArrayBuffer {
  const buf = Buffer.from(text, 'utf-8');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function mockFetchByUrl(handlers: Record<string, () => Promise<{ ok: boolean; status?: number; arrayBuffer: () => Promise<ArrayBuffer> }>>) {
  return jest.fn(async (url: string) => {
    const handler = handlers[url];
    if (!handler) throw new Error(`URL inesperada no teste: ${url}`);
    return handler();
  });
}

describe('RjAgetranspTollDataProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('isAvailable() e sempre true -- fonte publica, sem chave/configuracao', () => {
    expect(new RjAgetranspTollDataProvider().isAvailable()).toBe(true);
  });

  it('baixa as 2 concessoes configuradas (Via Lagos e Rota 116) e normaliza tarifas com sucesso', async () => {
    const fetchSpy = mockFetchByUrl({
      [VIA_LAGOS_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(buildValidHtml('92,00', '1630')) }),
      [ROTA_116_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(buildValidHtml('88,00', '1631')) }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RjAgetranspTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(result.failedConcessions).toHaveLength(0);
    expect(result.tariffs).toHaveLength(2);
    const viaLagos = result.tariffs.find((t) => t.concessionaire === 'Via Lagos');
    expect(viaLagos).toMatchObject({ axleCategory: '5 eixos', price: 92, currency: 'BRL', status: 'VERIFIED' });
    expect(viaLagos?.effectiveFrom).toEqual(new Date(Date.UTC(2025, 7, 1)));
    expect(viaLagos?.highway).toBeNull();
    expect(viaLagos?.km).toBeNull();
    const rota116 = result.tariffs.find((t) => t.concessionaire === 'Rota 116');
    expect(rota116?.price).toBe(88);
  });

  it('tenta novamente (retry) apos falha transitoria e tem sucesso na segunda tentativa', async () => {
    let viaLagosCalls = 0;
    const fetchSpy = jest.fn(async (url: string) => {
      if (url === VIA_LAGOS_URL) {
        viaLagosCalls += 1;
        if (viaLagosCalls === 1) throw new Error('ECONNRESET');
        return { ok: true, arrayBuffer: async () => toArrayBuffer(buildValidHtml()) };
      }
      if (url === ROTA_116_URL) {
        return { ok: true, arrayBuffer: async () => toArrayBuffer(buildValidHtml('88,00', '1631')) };
      }
      throw new Error(`URL inesperada: ${url}`);
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RjAgetranspTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(viaLagosCalls).toBe(2);
    expect(result.failedConcessions).toHaveLength(0);
  });

  it('desiste apos esgotar as tentativas e reporta a concessao em failedConcessions, sem afetar a outra', async () => {
    const fetchSpy = mockFetchByUrl({
      [VIA_LAGOS_URL]: async () => {
        throw new Error('ECONNRESET');
      },
      [ROTA_116_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(buildValidHtml('88,00', '1631')) }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RjAgetranspTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(result.failedConcessions).toHaveLength(1);
    expect(result.failedConcessions[0]!.name).toBe('Via Lagos');
    // A falha de Via Lagos nunca impede a coleta de Rota 116.
    expect(result.tariffs.some((t) => t.concessionaire === 'Rota 116')).toBe(true);
  });

  it('HTTP nao-ok (403/404/503) e tratado como falha da concessao, nunca interpretado como pagina valida', async () => {
    const fetchSpy = mockFetchByUrl({
      [VIA_LAGOS_URL]: async () => ({ ok: false, status: 403, arrayBuffer: async () => toArrayBuffer('') }),
      [ROTA_116_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(buildValidHtml('88,00', '1631')) }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RjAgetranspTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(result.failedConcessions[0]!.reason).toContain('403');
  });

  it('resposta suspeita menor que o minimo esperado e rejeitada', async () => {
    const fetchSpy = mockFetchByUrl({
      [VIA_LAGOS_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer('<html>pagina curta</html>') }),
      [ROTA_116_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(buildValidHtml('88,00', '1631')) }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RjAgetranspTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(result.failedConcessions.some((f) => f.name === 'Via Lagos')).toBe(true);
  });

  it('pagina sem estrutura reconhecivel vira falha da concessao (estrutura mudou), nunca "zero tarifas" silencioso', async () => {
    const unrecognizable = '<html><body>pagina generica sem tabela</body></html>'.padEnd(2_500, ' ');
    const fetchSpy = mockFetchByUrl({
      [VIA_LAGOS_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(unrecognizable) }),
      [ROTA_116_URL]: async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(buildValidHtml('88,00', '1631')) }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RjAgetranspTollDataProvider();
    const result = await provider.fetchTariffs();

    expect(result.failedConcessions.find((f) => f.name === 'Via Lagos')?.reason).toContain('nao reconhecida');
  });
});
