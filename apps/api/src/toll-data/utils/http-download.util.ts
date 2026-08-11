// Fase 35/36 -- download com timeout, validacao de tamanho minimo e retry
// limitado com backoff, extraido para ser reaproveitado por qualquer
// provider de tarifa que baixe paginas HTML publicas (ANTT_TARIFAS,
// RJ_AGETRANSP) -- nunca duplicar esta logica por provider. Decodifica
// UTF-8 explicitamente (nunca confia no charset declarado pelo servidor --
// ver antt-concession-tariff.provider.ts: o header do gov.br anuncia
// "iso-8859-1" mas o conteudo real e UTF-8).
export interface HttpDownloadOptions {
  timeoutMs: number;
  maxAttempts: number;
  retryBackoffMs: number;
  minSizeBytes: number;
  userAgent: string;
}

export const DEFAULT_HTTP_DOWNLOAD_OPTIONS: HttpDownloadOptions = {
  timeoutMs: 10_000,
  maxAttempts: 2, // 1 tentativa + 1 retry -- nunca mais que isso (nao bombardear a fonte).
  retryBackoffMs: 1_000,
  minSizeBytes: 2_000, // paginas reais das fontes verificadas tem dezenas de KB; abaixo disso e provavel bloqueio/erro.
  userAgent: 'TransportadorasSaaS-TollDataSync/1.0 (sincronizacao diaria de tarifas oficiais; contato: suporte@transportadoras-saas.exemplo)',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtmlWithRetry(
  url: string,
  options: Partial<HttpDownloadOptions> = {},
  attempt = 1,
): Promise<string> {
  const opts = { ...DEFAULT_HTTP_DOWNLOAD_OPTIONS, ...options };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': opts.userAgent },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength < opts.minSizeBytes) {
      throw new Error(`Resposta menor que o esperado (${buffer.byteLength} bytes) -- provavel bloqueio ou pagina de erro.`);
    }
    return buffer.toString('utf-8');
  } catch (error) {
    if (attempt < opts.maxAttempts) {
      await sleep(opts.retryBackoffMs * attempt);
      return fetchHtmlWithRetry(url, options, attempt + 1);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
