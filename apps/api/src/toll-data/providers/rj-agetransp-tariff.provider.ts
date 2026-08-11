import { Injectable, Logger } from '@nestjs/common';
import { TollDataProvider } from '@prisma/client';
import { NormalizedTollTariff, TollDataProviderPort, TollTariffProviderFetchResult } from '../interfaces/normalized-toll-plaza.interface';
import { fetchHtmlWithRetry } from '../utils/http-download.util';
import { normalizeRjAgetranspTariffs } from './rj-agetransp-tariff.parser';
import { buildRjAgetranspTariffUrl, RJ_AGETRANSP_CONCESSIONS, RjAgetranspConcessionConfig } from './rj-agetransp-concessions.config';

// Fase 36 -- fonte confirmada na Fase 34 e REVALIDADA nesta fase (download
// real em 10/08/2026): agetransp.rj.gov.br publica, para cada concessao
// estadual do RJ, uma pagina com tarifa por categoria/eixos E vigencia
// legal explicita ("Cobranca praticada a partir de..." + link da
// deliberacao) -- ver rj-agetransp-tariff.parser.ts. Provider DISTINTO de
// AnttConcessionTollDataProvider (fonte, formato e semantica de vigencia
// diferentes) -- nunca fundidos (enum TollDataProvider: RJ_AGETRANSP).
//
// Diferenca estrutural real em relacao a ANTT: a tarifa AGETRANSP e UNICA
// por concessao (a pagina nao tem coluna por praca), entao este provider
// nao tem uma "pagina de localizacao de pracas" irma -- highway/km/
// coordenadas ficam sempre null nos registros normalizados (nunca
// inventados); o matching correspondente (TollDataSyncService.
// applyTariffs) aplica a mesma tarifa a TODAS as pracas ja conhecidas da
// concessionaria, ver comentario la.
const INTER_CONCESSION_DELAY_MS = 500; // sincronizacao diaria, nunca polling agressivo.

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class RjAgetranspTollDataProvider implements TollDataProviderPort {
  readonly provider: TollDataProvider = TollDataProvider.RJ_AGETRANSP;
  private readonly logger = new Logger(RjAgetranspTollDataProvider.name);

  // Fonte publica, sem credencial -- sempre "disponivel" do ponto de vista
  // de configuracao. Falha real de rede/estrutura acontece por concessao,
  // dentro de fetchTariffs() (secao 18: uma falha nunca impede as demais).
  isAvailable(): boolean {
    return true;
  }

  async fetchTariffs(): Promise<TollTariffProviderFetchResult> {
    const tariffs: NormalizedTollTariff[] = [];
    const failedConcessions: { name: string; reason: string }[] = [];

    for (let index = 0; index < RJ_AGETRANSP_CONCESSIONS.length; index += 1) {
      const concession = RJ_AGETRANSP_CONCESSIONS[index]!;
      try {
        const concessionTariffs = await this.fetchConcessionTariffs(concession);
        tariffs.push(...concessionTariffs);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Erro desconhecido.';
        this.logger.error(`Falha ao sincronizar tarifas da concessao "${concession.name}": ${reason}`);
        failedConcessions.push({ name: concession.name, reason });
      }

      if (index < RJ_AGETRANSP_CONCESSIONS.length - 1) {
        await sleep(INTER_CONCESSION_DELAY_MS);
      }
    }

    return {
      tariffs,
      sourceReference: 'https://www.agetransp.rj.gov.br',
      failedConcessions,
    };
  }

  private async fetchConcessionTariffs(concession: RjAgetranspConcessionConfig): Promise<NormalizedTollTariff[]> {
    const url = buildRjAgetranspTariffUrl(concession);
    const html = await fetchHtmlWithRetry(url);

    const normalized = normalizeRjAgetranspTariffs(html);
    if (normalized.length === 0) {
      // Pagina baixada com sucesso (HTTP 200, tamanho plausivel) mas sem
      // nenhuma tarifa reconhecivel = estrutura mudou -- FAILED para esta
      // concessao, nunca interpretado como "sem tarifas".
      throw new Error('Estrutura da pagina nao reconhecida (nenhuma tarifa extraida) -- fonte pode ter mudado de formato.');
    }

    return normalized.map((row) => ({
      concessionaire: concession.name,
      highway: null,
      km: null,
      city: null,
      latitude: null,
      longitude: null,
      axleCategory: row.axleCategory,
      price: row.price,
      currency: row.currency,
      sourceReference: row.sourceReference ?? url,
      sourceDocument: row.sourceDocument ?? `Tarifas de pedagio -- ${concession.name} (agetransp.rj.gov.br)`,
      ...(row.effectiveFrom ? { effectiveFrom: row.effectiveFrom, status: 'VERIFIED' as const } : {}),
    }));
  }
}
