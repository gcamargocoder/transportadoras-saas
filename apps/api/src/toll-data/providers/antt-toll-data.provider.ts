import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { TollDataProviderFetchResult, TollDataProviderPort } from '../interfaces/normalized-toll-plaza.interface';
import { parseAnttKml } from './antt-kml.parser';

// Fase 33 -- fonte CONFIRMADA por pesquisa real em 10/08/2026 (ver relatorio
// final da fase): dataset "Praca de Pedagio" do Portal de Dados Abertos da
// ANTT, publicado como KMZ (KML compactado), atualizado mensalmente.
// Contem localizacao/identidade de 158 pracas -- NENHUMA tarifa (a ANTT nao
// publica tarifa como dado aberto estruturado; ver ArtespTollDataProvider e
// o relatorio da fase para a limitacao completa).
export const ANTT_DATASET_URL =
  'https://dados.antt.gov.br/dataset/a7e1e12d-f8e8-40cd-bc1f-57973a4a4a6d/resource/1a32b252-e47f-4698-a098-9e4ba956af30/download/praca-de-pedagio.kmz';

@Injectable()
export class AnttTollDataProvider implements TollDataProviderPort {
  readonly provider = 'ANTT' as const;
  private readonly logger = new Logger(AnttTollDataProvider.name);

  // Fonte publica -- nao existe "chave da ANTT" (secao 15 da fase), sempre
  // disponivel do ponto de vista de configuracao (pode falhar em tempo de
  // execucao se o servidor da ANTT estiver fora do ar, ver fetchPlazas()).
  isAvailable(): boolean {
    return true;
  }

  async fetchPlazas(): Promise<TollDataProviderFetchResult> {
    let buffer: Buffer;
    try {
      const response = await fetch(ANTT_DATASET_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.error(
        `Falha ao baixar o dataset da ANTT: ${error instanceof Error ? error.message : error}`,
      );
      throw new ServiceUnavailableException('Fonte ANTT indisponivel no momento.');
    }

    let kml: string;
    try {
      const zip = new AdmZip(buffer);
      const kmlEntry = zip.getEntries().find((entry) => entry.entryName.toLowerCase().endsWith('.kml'));
      if (!kmlEntry) {
        throw new Error('Nenhum arquivo .kml encontrado dentro do KMZ.');
      }
      kml = kmlEntry.getData().toString('utf-8');
    } catch (error) {
      this.logger.error(
        `Falha ao extrair o KMZ da ANTT (formato inesperado): ${error instanceof Error ? error.message : error}`,
      );
      throw new ServiceUnavailableException('Nao foi possivel interpretar o arquivo da ANTT (formato inesperado).');
    }

    const plazas = parseAnttKml(kml);
    return { plazas, sourceReference: ANTT_DATASET_URL };
  }
}
