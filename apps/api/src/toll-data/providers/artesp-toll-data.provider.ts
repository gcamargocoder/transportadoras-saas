import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TollDataProviderFetchResult, TollDataProviderPort } from '../interfaces/normalized-toll-plaza.interface';

// Fase 33 -- LIMITACAO CONHECIDA, documentada apos pesquisa real em
// 10/08/2026 (ver relatorio final da fase, secao "Fontes oficiais
// encontradas"). Investigado:
//   - dadosabertos.artesp.sp.gov.br/dataset/pedagio -- o "recurso" listado e
//     apenas um link para a pagina HTML institucional de pedagios, nao um
//     arquivo estruturado (CSV/XLSX/JSON/API).
//   - dadosabertos.sp.gov.br/dataset/pedagios -- aponta para
//     der.sp.gov.br/.../ValoresPedagio.aspx, uma pagina interativa (sem
//     tabela HTML estatica nem link de download identificavel na resposta
//     obtida) -- provavelmente dependente de postback/JavaScript.
//   - Tarifas da ARTESP sao publicadas EXCLUSIVAMENTE em PDF ("Valor Atual
//     das Tarifas", "Historico de Tarifas") por concessionaria.
//
// Por isso: NENHUM endpoint foi inventado. Este provider existe para provar
// que a arquitetura suporta multiplos providers (secao 37 da fase -- "para
// adicionar uma nova fonte, criar somente o adapter") sem fingir uma
// automacao que nao foi confirmada. Fica desabilitado por padrao
// (TollDataSource.enabled=false) ate uma fonte estruturada real ser
// confirmada ou uma extracao de PDF ser deliberadamente construida e
// validada (fora do escopo desta fase -- nao avançar cego).
@Injectable()
export class ArtespTollDataProvider implements TollDataProviderPort {
  readonly provider = 'ARTESP' as const;

  isAvailable(): boolean {
    return false;
  }

  async fetchPlazas(): Promise<TollDataProviderFetchResult> {
    throw new ServiceUnavailableException(
      'Fonte ARTESP nao possui, ate o momento, um dataset estruturado confirmado ' +
        '(tarifas sao publicadas apenas em PDF por concessionaria) -- ver relatorio da Fase 33. ' +
        'Sincronizacao automatica desta fonte permanece pendente.',
    );
  }
}
