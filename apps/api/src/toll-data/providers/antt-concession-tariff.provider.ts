import { Injectable, Logger } from '@nestjs/common';
import { TollDataProvider } from '@prisma/client';
import {
  NormalizedTollTariff,
  TollDataProviderPort,
  TollTariffProviderFetchResult,
} from '../interfaces/normalized-toll-plaza.interface';
import { fetchHtmlWithRetry } from '../utils/http-download.util';
import { normalizeAnttConcessionTariffs } from './antt-concession-tariff.parser';
import { ANTT_CONCESSIONS, AnttConcessionConfig, buildAnttPlazaLocationsUrl, buildAnttTariffsUrl } from './antt-concessions.config';

// Fase 35 -- fonte confirmada na Fase 34: gov.br/antt publica, para cada
// concessao federal, tarifas por praca/categoria/eixos em HTML (ver
// antt-concession-tariff.parser.ts). Provider DISTINTO de
// AnttTollDataProvider (que continua responsavel so pelo catalogo
// geografico de pracas via KMZ) -- nunca fundidos, nunca substitui um ao
// outro (ver enum TollDataProvider: ANTT = pracas, ANTT_TARIFAS = tarifas).
const INTER_CONCESSION_DELAY_MS = 500; // sincronizacao diaria, nunca polling agressivo -- espaca as requisicoes entre concessoes.

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class AnttConcessionTollDataProvider implements TollDataProviderPort {
  readonly provider: TollDataProvider = TollDataProvider.ANTT_TARIFAS;
  private readonly logger = new Logger(AnttConcessionTollDataProvider.name);

  // Fonte publica, sem credencial -- sempre "disponivel" do ponto de vista
  // de configuracao (mesma semantica de AnttTollDataProvider). Falha real
  // de rede/estrutura acontece por concessao, dentro de fetchTariffs().
  isAvailable(): boolean {
    return true;
  }

  async fetchTariffs(): Promise<TollTariffProviderFetchResult> {
    const tariffs: NormalizedTollTariff[] = [];
    const failedConcessions: { name: string; reason: string }[] = [];

    // Sequencial de proposito (secao 18/19): uma concessao falhando nunca
    // impede as demais, e nunca disparamos requisicoes em paralelo contra
    // a mesma fonte.
    for (let index = 0; index < ANTT_CONCESSIONS.length; index += 1) {
      const concession = ANTT_CONCESSIONS[index]!;
      try {
        const concessionTariffs = await this.fetchConcessionTariffs(concession);
        tariffs.push(...concessionTariffs);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Erro desconhecido.';
        this.logger.error(`Falha ao sincronizar tarifas da concessao "${concession.name}": ${reason}`);
        failedConcessions.push({ name: concession.name, reason });
      }

      if (index < ANTT_CONCESSIONS.length - 1) {
        await sleep(INTER_CONCESSION_DELAY_MS);
      }
    }

    return {
      tariffs,
      sourceReference: 'https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes',
      failedConcessions,
    };
  }

  private async fetchConcessionTariffs(concession: AnttConcessionConfig): Promise<NormalizedTollTariff[]> {
    const tariffsUrl = buildAnttTariffsUrl(concession);
    const locationsUrl = buildAnttPlazaLocationsUrl(concession);

    // Decodificacao UTF-8 explicita (secao 7) -- o cabecalho Content-Type
    // deste site anuncia "iso-8859-1" mas o conteudo real observado
    // (verificado byte-a-byte na Fase 34/35) e UTF-8; confiar cegamente no
    // charset declarado corromperia acentuacao (ver http-download.util.ts).
    const tariffHtml = await fetchHtmlWithRetry(tariffsUrl);
    const locationsHtml = await fetchHtmlWithRetry(locationsUrl);

    const normalized = normalizeAnttConcessionTariffs(tariffHtml, locationsHtml);
    if (normalized.length === 0) {
      // Paginas baixadas com sucesso (HTTP 200, tamanho plausivel) mas sem
      // nenhum registro reconhecivel = estrutura mudou (secao 7/8: "se a
      // estrutura mudar: FAILED"). Nunca interpretado como "sem tarifas".
      throw new Error('Estrutura da pagina nao reconhecida (nenhuma tarifa extraida) -- fonte pode ter mudado de formato.');
    }

    return normalized.map((row) => ({
      ...row,
      concessionaire: concession.name,
      sourceReference: tariffsUrl,
      sourceDocument: `Tarifas de pedagio -- ${concession.name} (gov.br/antt)`,
    }));
  }
}
