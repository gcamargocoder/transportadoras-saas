import { Injectable } from '@nestjs/common';
import { TollDataProvider, TollDataSource } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Fase 35 -- extraido de TollDataSyncService para quebrar uma dependencia
// circular real: TollRatesService precisa de ensureSource() (para
// registrar de onde uma tarifa administrativa veio, Fase 33) e
// TollDataSyncService precisa de TollRatesService (Fase 35, para persistir
// tarifas sincronizadas automaticamente via upsertFromAutomatedSource) --
// as duas nao podem depender uma da outra ao mesmo tempo. Gerenciar
// TollDataSource (upsert/listagem) e, alias, uma responsabilidade propria
// (nao e "sincronizar", e "saber quais fontes existem"), entao a extracao
// tambem melhora a separacao de responsabilidades, nao e so um contorno.
const SOURCE_METADATA: Record<TollDataProvider, { name: string; authority: string; baseUrl: string }> = {
  ANTT: {
    name: 'ANTT -- Praca de Pedagio (Dados Abertos)',
    authority: 'Agencia Nacional de Transportes Terrestres',
    baseUrl: 'https://dados.antt.gov.br/dataset/praca-de-pedagio',
  },
  ANTT_TARIFAS: {
    name: 'ANTT -- Tarifas de Pedagio por Concessao',
    authority: 'Agencia Nacional de Transportes Terrestres',
    baseUrl: 'https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes',
  },
  RJ_AGETRANSP: {
    name: 'AGETRANSP -- Tarifas de Pedagio (Rodovias Estaduais RJ)',
    authority: 'Agencia Reguladora de Servicos Publicos Concedidos de Transportes do Estado do Rio de Janeiro',
    baseUrl: 'https://www.agetransp.rj.gov.br',
  },
  ARTESP: {
    name: 'ARTESP -- Tarifas de Pedagio',
    authority: 'Agencia de Transporte do Estado de Sao Paulo',
    baseUrl: 'https://www.artesp.sp.gov.br/artesp/setor-regulado/rodovia/pedagios',
  },
  OTHER: {
    name: 'Outra fonte',
    authority: 'Nao especificada',
    baseUrl: '',
  },
};

// Ordem estavel para inicializar TollDataSource de todos os providers
// conhecidos (usado por listSources()) -- nao depende da ordem de insercao
// no enum do Prisma.
const TOLL_DATA_PROVIDERS_ENUM: TollDataProvider[] = [
  TollDataProvider.ANTT,
  TollDataProvider.ANTT_TARIFAS,
  TollDataProvider.RJ_AGETRANSP,
  TollDataProvider.ARTESP,
  TollDataProvider.OTHER,
];

@Injectable()
export class TollDataSourceService {
  constructor(private readonly prisma: PrismaService) {}

  // Garante 1 TollDataSource por provider -- idempotente (upsert), nunca
  // duplica a linha em sincronizacoes repetidas.
  async ensureSource(provider: TollDataProvider): Promise<TollDataSource> {
    const metadata = SOURCE_METADATA[provider];
    return this.prisma.tollDataSource.upsert({
      where: { provider },
      update: {},
      create: { provider, ...metadata },
    });
  }

  async listSources(): Promise<TollDataSource[]> {
    await Promise.all(TOLL_DATA_PROVIDERS_ENUM.map((provider) => this.ensureSource(provider)));
    return this.prisma.tollDataSource.findMany({ orderBy: { provider: 'asc' } });
  }
}
