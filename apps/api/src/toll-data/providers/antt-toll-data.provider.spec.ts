import { ServiceUnavailableException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { ANTT_DATASET_URL, AnttTollDataProvider } from './antt-toll-data.provider';

// Mesmo padrao de google.provider.spec.ts (Fase 26): mocka global.fetch na
// fronteira HTTP, nunca o parser/normalizacao internos -- a logica real de
// parseAnttKml (ja coberta por antt-kml.parser.spec.ts) roda de verdade
// aqui tambem, so o download+unzip e que nao toca a rede real da ANTT.
const SINGLE_PLACEMARK_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <Placemark id="ID_00000">
    <name>AUTOPISTA FERNÃO DIAS</name>
    <description><![CDATA[<html><body><table>
<tr><td>concession</td><td>AUTOPISTA FERNÃO DIAS</td></tr>
<tr><td>praca_de_p</td><td>1 Norte (Mairiporã)</td></tr>
<tr><td>rodovia</td><td>BR-381</td></tr>
<tr><td>uf</td><td>SP</td></tr>
<tr><td>km_m</td><td>65,7</td></tr>
<tr><td>municipio</td><td>Mairiporã</td></tr>
<tr><td>situacao</td><td>Ativo</td></tr>
<tr><td>latitude</td><td>-23,322298</td></tr>
<tr><td>longitude</td><td>-46,581097</td></tr>
</table></body></html>
]]></description>
    <Point><coordinates> -46.581097,-23.322298,0</coordinates></Point>
  </Placemark>
</Document>
</kml>`;

function buildKmzBuffer(kml: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('praca-de-pedagio.kml', Buffer.from(kml, 'utf-8'));
  return zip.toBuffer();
}

describe('AnttTollDataProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('isAvailable() e sempre true -- fonte publica, sem chave/configuracao (secao 15)', () => {
    expect(new AnttTollDataProvider().isAvailable()).toBe(true);
  });

  it('baixa o KMZ, descompacta e normaliza as pracas com a URL real do dataset', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => buildKmzBuffer(SINGLE_PLACEMARK_KML).buffer,
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new AnttTollDataProvider();
    const result = await provider.fetchPlazas();

    expect(fetchSpy).toHaveBeenCalledWith(ANTT_DATASET_URL);
    expect(result.sourceReference).toBe(ANTT_DATASET_URL);
    expect(result.plazas).toHaveLength(1);
    expect(result.plazas[0]!.concessionaire).toBe('AUTOPISTA FERNÃO DIAS');
    expect(result.plazas[0]!.highway).toBe('BR-381');
    expect(result.plazas[0]!.km).toBeCloseTo(65.7);
    // nenhum campo de tarifa -- ANTT nao publica tarifa como dado aberto.
    expect((result.plazas[0]!.raw as Record<string, unknown>)['tarifa']).toBeUndefined();
    expect((result.plazas[0]!.raw as Record<string, unknown>)['price']).toBeUndefined();
  });

  it('lanca ServiceUnavailableException quando o download HTTP falha, sem tentar interpretar nada', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

    const provider = new AnttTollDataProvider();
    await expect(provider.fetchPlazas()).rejects.toThrow(ServiceUnavailableException);
  });

  it('lanca ServiceUnavailableException quando a chamada de rede rejeita (fonte fora do ar)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;

    const provider = new AnttTollDataProvider();
    await expect(provider.fetchPlazas()).rejects.toThrow(ServiceUnavailableException);
  });

  it('lanca ServiceUnavailableException quando o arquivo baixado nao e um ZIP valido (mudanca de formato da fonte)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from('nao e um zip').buffer,
    }) as unknown as typeof fetch;

    const provider = new AnttTollDataProvider();
    await expect(provider.fetchPlazas()).rejects.toThrow(ServiceUnavailableException);
  });

  it('lanca ServiceUnavailableException quando o ZIP nao contem nenhum arquivo .kml', async () => {
    const zip = new AdmZip();
    zip.addFile('leiame.txt', Buffer.from('sem kml aqui'));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => zip.toBuffer().buffer,
    }) as unknown as typeof fetch;

    const provider = new AnttTollDataProvider();
    await expect(provider.fetchPlazas()).rejects.toThrow(ServiceUnavailableException);
  });
});
