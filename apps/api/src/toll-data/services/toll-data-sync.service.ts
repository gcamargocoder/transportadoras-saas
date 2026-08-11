import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, TollDataProvider, TollDataSource, TollDataSyncRun, TollDataSyncStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import {
  NormalizedTollTariff,
  NormalizedTollPlaza,
  TollDataProviderPort,
} from '../interfaces/normalized-toll-plaza.interface';
import { findMatchingTollPlaza, TollPlazaMatchCandidate } from '../utils/toll-plaza-matching.util';
import { FindTollDataSyncRunsQueryDto } from '../dto/find-toll-data-sync-runs-query.dto';
import { TOLL_DATA_PROVIDERS } from '../toll-data.constants';
import { TollDataSourceService } from './toll-data-source.service';
import { TollRatesService } from './toll-rates.service';

export interface TollDataSyncOutcome {
  runId: string;
  status: TollDataSyncStatus;
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  recordsRejected: number;
  errorMessage: string | null;
}

// Fase 33, secao 9 (pracas) + Fase 35 (tarifas por concessao) -- orquestra:
// buscar -> normalizar (feito pelo proprio provider) -> validar -> comparar
// -> versionar -> registrar resultado. NUNCA duplica descoberta de
// pedagio/conciliacao/roteirizacao -- so alimenta TollPlaza/TollRate, que os
// motores existentes (Fase 26/33/TollReconciliationService) ja consomem.
//
// Fase 35 -- um MESMO provider so implementa fetchPlazas() OU fetchTariffs()
// (nunca os dois nesta fase); sync() verifica qual metodo o provider
// resolvido de fato tem e segue o fluxo correspondente. Isso evita duplicar
// o orquestrador (TollDataSyncRun/scheduler/endpoint) para cada "tipo" de
// fonte nova.
@Injectable()
export class TollDataSyncService {
  private readonly logger = new Logger(TollDataSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceService: TollDataSourceService,
    private readonly ratesService: TollRatesService,
    @Inject(TOLL_DATA_PROVIDERS) private readonly providers: TollDataProviderPort[],
  ) {}

  async ensureSource(provider: TollDataProvider): Promise<TollDataSource> {
    return this.sourceService.ensureSource(provider);
  }

  async listSources(): Promise<TollDataSource[]> {
    return this.sourceService.listSources();
  }

  // GET /toll-data/sync-runs (secao 12) -- historico paginado, mais recente
  // primeiro. Filtros opcionais por provider/status.
  async findSyncRuns(query: FindTollDataSyncRunsQueryDto): Promise<{ items: TollDataSyncRun[]; total: number }> {
    const where: Prisma.TollDataSyncRunWhereInput = {
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tollDataSyncRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tollDataSyncRun.count({ where }),
    ]);

    return { items, total };
  }

  // POST /toll-data/sync (secao 11) -- triggeredBy = "scheduler" na execucao
  // automatica (secao 10) ou o userId do administrador na execucao manual.
  async sync(provider: TollDataProvider, triggeredBy: string): Promise<TollDataSyncOutcome> {
    const source = await this.sourceService.ensureSource(provider);
    const run = await this.prisma.tollDataSyncRun.create({
      data: { sourceId: source.id, provider, status: TollDataSyncStatus.RUNNING, triggeredBy },
    });

    const providerImpl = this.providers.find((p) => p.provider === provider);

    // Fonte desabilitada ou provider sem implementacao disponivel (secao 21):
    // nunca apaga/altera dados existentes, so registra e sai.
    if (!source.enabled || !providerImpl || !providerImpl.isAvailable()) {
      const message = !source.enabled
        ? 'Fonte desabilitada (TollDataSource.enabled=false).'
        : 'Provider sem fonte estruturada automatizavel confirmada nesta fase.';
      return this.finishRun(run.id, source.id, {
        status: TollDataSyncStatus.FAILED,
        errorMessage: message,
        recordsRead: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsUnchanged: 0,
        recordsRejected: 0,
      });
    }

    if (providerImpl.fetchPlazas) {
      return this.syncPlazas(providerImpl, provider, source.id, run.id);
    }
    if (providerImpl.fetchTariffs) {
      return this.syncTariffs(providerImpl, source.id, run.id);
    }

    // Nunca deveria acontecer (provider registrado sem nenhum metodo de
    // busca) -- mas se acontecer, falha explicitamente em vez de silenciar.
    return this.finishRun(run.id, source.id, {
      status: TollDataSyncStatus.FAILED,
      errorMessage: 'Provider registrado sem fetchPlazas() nem fetchTariffs().',
      recordsRead: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsUnchanged: 0,
      recordsRejected: 0,
    });
  }

  // ==========================================================================
  // fluxo de PRACAS (Fase 33) -- inalterado
  // ==========================================================================

  private async syncPlazas(
    providerImpl: TollDataProviderPort,
    provider: TollDataProvider,
    sourceId: string,
    runId: string,
  ): Promise<TollDataSyncOutcome> {
    let fetchResult: Awaited<ReturnType<NonNullable<TollDataProviderPort['fetchPlazas']>>>;
    try {
      fetchResult = await providerImpl.fetchPlazas!();
    } catch (error) {
      // Falha da fonte (secao 21/22): preserva o ultimo snapshot valido,
      // nunca apaga/zera nada. Mensagem sanitizada -- nunca corpo bruto da
      // resposta (poderia conter detalhes de infraestrutura da fonte).
      const message = error instanceof Error ? error.message : 'Erro desconhecido ao sincronizar.';
      this.logger.error(`Sincronizacao ${provider} falhou: ${message}`);
      return this.finishRun(runId, sourceId, {
        status: TollDataSyncStatus.FAILED,
        errorMessage: message,
        recordsRead: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsUnchanged: 0,
        recordsRejected: 0,
      });
    }

    const result = await this.applyPlazas(provider, sourceId, fetchResult.plazas);
    return this.finishRun(runId, sourceId, {
      status: this.statusFromCounts(result),
      errorMessage: null,
      ...result,
    });
  }

  // Fase 33, secao 33 -- performance: 2 consultas de leitura em lote (links
  // existentes do provider + candidatos globais para matching), nunca uma
  // query por praca. Escritas continuam por linha (create/update tem
  // semantica propria por registro), mas agrupadas numa unica transacao.
  private async applyPlazas(
    provider: TollDataProvider,
    sourceId: string,
    plazas: NormalizedTollPlaza[],
  ): Promise<{ recordsRead: number; recordsCreated: number; recordsUpdated: number; recordsUnchanged: number; recordsRejected: number }> {
    let recordsCreated = 0;
    let recordsUpdated = 0;
    let recordsUnchanged = 0;
    let recordsRejected = 0;

    const existingLinks = await this.prisma.tollPlazaDataSourceLink.findMany({ where: { provider } });
    const linkBySourceKey = new Map(existingLinks.map((link) => [link.sourceKey, link]));
    const linkedPlazaIds = new Set(existingLinks.map((link) => link.tollPlazaId));

    const allPlazas = await this.prisma.tollPlaza.findMany();
    const matchCandidates: TollPlazaMatchCandidate[] = allPlazas
      .filter((plaza) => !linkedPlazaIds.has(plaza.id))
      .map((plaza) => ({ id: plaza.id, operator: plaza.operator, highway: plaza.highway, km: toNumberOrNull(plaza.km) }));

    const now = new Date();

    for (const normalized of plazas) {
      // Validacao minima (secao 23) -- rejeita silenciosamente registros sem
      // NENHUMA ancora geografica (nao ha o que persistir com seguranca).
      if (normalized.km === null && normalized.latitude === null && normalized.longitude === null) {
        recordsRejected += 1;
        continue;
      }

      const existingLink = linkBySourceKey.get(normalized.sourceKey);

      if (existingLink) {
        const changed = await this.updateLinkedPlaza(existingLink.tollPlazaId, existingLink.id, normalized, now);
        if (changed) recordsUpdated += 1;
        else recordsUnchanged += 1;
        continue;
      }

      const outcome = findMatchingTollPlaza(normalized, matchCandidates);
      if (outcome.matchedPlazaId) {
        await this.linkExistingPlaza(outcome.matchedPlazaId, sourceId, provider, normalized, now, outcome.confidence);
        // Remove da pool de candidatos: a mesma praca ja linkada nesta
        // execucao nunca deve ser candidata de novo (evita 2 registros da
        // fonte "roubarem" a mesma praca).
        const idx = matchCandidates.findIndex((c) => c.id === outcome.matchedPlazaId);
        if (idx >= 0) matchCandidates.splice(idx, 1);
        recordsUpdated += 1;
      } else {
        await this.createPlazaWithLink(sourceId, provider, normalized, now, outcome.confidence);
        recordsCreated += 1;
      }
    }

    return { recordsRead: plazas.length, recordsCreated, recordsUpdated, recordsUnchanged, recordsRejected };
  }

  private toPlazaUpdateData(normalized: NormalizedTollPlaza): Prisma.TollPlazaUpdateInput {
    return {
      name: normalized.name,
      operator: normalized.concessionaire,
      highway: normalized.highway,
      km: normalized.km,
      city: normalized.city,
      state: normalized.state,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
    };
  }

  private hasPlazaChanged(
    current: { name: string; operator: string; highway: string | null; km: Prisma.Decimal | null; city: string | null; state: string | null },
    normalized: NormalizedTollPlaza,
  ): boolean {
    return (
      current.name !== normalized.name ||
      current.operator !== normalized.concessionaire ||
      current.highway !== normalized.highway ||
      toNumberOrNull(current.km) !== normalized.km ||
      current.city !== normalized.city ||
      current.state !== normalized.state
    );
  }

  private async updateLinkedPlaza(
    tollPlazaId: string,
    linkId: string,
    normalized: NormalizedTollPlaza,
    now: Date,
  ): Promise<boolean> {
    const current = await this.prisma.tollPlaza.findUniqueOrThrow({ where: { id: tollPlazaId } });
    const changed = this.hasPlazaChanged(current, normalized);

    await this.prisma.$transaction([
      ...(changed
        ? [this.prisma.tollPlaza.update({ where: { id: tollPlazaId }, data: this.toPlazaUpdateData(normalized) })]
        : []),
      this.prisma.tollPlazaDataSourceLink.update({
        where: { id: linkId },
        data: { rawSnapshot: normalized.raw as Prisma.InputJsonValue, lastSeenAt: now },
      }),
    ]);

    return changed;
  }

  private async linkExistingPlaza(
    tollPlazaId: string,
    sourceId: string,
    provider: TollDataProvider,
    normalized: NormalizedTollPlaza,
    now: Date,
    confidence: 'LINKED' | 'PENDING_REVIEW',
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.tollPlaza.update({ where: { id: tollPlazaId }, data: this.toPlazaUpdateData(normalized) }),
      this.prisma.tollPlazaDataSourceLink.create({
        data: {
          tollPlazaId,
          sourceId,
          provider,
          sourceKey: normalized.sourceKey,
          matchConfidence: confidence,
          rawSnapshot: normalized.raw as Prisma.InputJsonValue,
          lastSeenAt: now,
        },
      }),
    ]);
  }

  private async createPlazaWithLink(
    sourceId: string,
    provider: TollDataProvider,
    normalized: NormalizedTollPlaza,
    now: Date,
    confidence: 'LINKED' | 'PENDING_REVIEW',
  ): Promise<void> {
    const plaza = await this.prisma.tollPlaza.create({ data: this.toPlazaUpdateData(normalized) as Prisma.TollPlazaCreateInput });
    await this.prisma.tollPlazaDataSourceLink.create({
      data: {
        tollPlazaId: plaza.id,
        sourceId,
        provider,
        sourceKey: normalized.sourceKey,
        matchConfidence: confidence,
        rawSnapshot: normalized.raw as Prisma.InputJsonValue,
        lastSeenAt: now,
      },
    });
  }

  // ==========================================================================
  // fluxo de TARIFAS por concessao (Fase 35)
  // ==========================================================================

  private async syncTariffs(providerImpl: TollDataProviderPort, sourceId: string, runId: string): Promise<TollDataSyncOutcome> {
    let fetchResult: Awaited<ReturnType<NonNullable<TollDataProviderPort['fetchTariffs']>>>;
    try {
      fetchResult = await providerImpl.fetchTariffs!();
    } catch (error) {
      // Falha total da fonte (secao 21/22, ex: pagina-indice fora do ar):
      // preserva tudo, nunca apaga/zera. Falha PARCIAL (uma concessao
      // especifica) e tratada dentro do proprio provider (secao 18) e
      // reportada via failedConcessions, nao chega aqui como excecao.
      const message = error instanceof Error ? error.message : 'Erro desconhecido ao sincronizar.';
      this.logger.error(`Sincronizacao de tarifas falhou: ${message}`);
      return this.finishRun(runId, sourceId, {
        status: TollDataSyncStatus.FAILED,
        errorMessage: message,
        recordsRead: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsUnchanged: 0,
        recordsRejected: 0,
      });
    }

    const result = await this.applyTariffs(sourceId, fetchResult.tariffs);
    // Concessoes que falharam individualmente (secao 18) contam como
    // rejeitadas para fins de status (PARTIAL), mas NUNCA aparecem como
    // "lidas" (nao foram lidas com sucesso).
    const recordsRejected = result.recordsRejected + fetchResult.failedConcessions.length;
    const errorMessage =
      fetchResult.failedConcessions.length > 0
        ? `Concessoes com falha: ${fetchResult.failedConcessions.map((f) => `${f.name} (${f.reason})`).join('; ')}`
        : null;

    return this.finishRun(runId, sourceId, {
      status: this.statusFromCounts({ ...result, recordsRejected }),
      errorMessage,
      recordsRead: result.recordsRead,
      recordsCreated: result.recordsCreated,
      recordsUpdated: result.recordsUpdated,
      recordsUnchanged: result.recordsUnchanged,
      recordsRejected,
    });
  }

  // Fase 35, secao 11/26 -- matching reaproveitando toll-plaza-matching.util
  // (nunca outro algoritmo). Performance: 1 query batelada de TollPlaza por
  // concessionaria distinta presente no lote (nunca 1 query por linha de
  // tarifa) -- tipicamente 1-2 concessionarias por execucao.
  private async applyTariffs(
    sourceId: string,
    tariffs: NormalizedTollTariff[],
  ): Promise<{ recordsRead: number; recordsCreated: number; recordsUpdated: number; recordsUnchanged: number; recordsRejected: number }> {
    let recordsCreated = 0;
    let recordsUpdated = 0;
    let recordsUnchanged = 0;
    let recordsRejected = 0;

    const concessionaires = [...new Set(tariffs.map((t) => t.concessionaire))];
    const candidatePlazas =
      concessionaires.length > 0 ? await this.prisma.tollPlaza.findMany({ where: { operator: { in: concessionaires } } }) : [];
    const candidatesByConcessionaire = new Map<string, TollPlazaMatchCandidate[]>();
    for (const plaza of candidatePlazas) {
      const list = candidatesByConcessionaire.get(plaza.operator) ?? [];
      list.push({ id: plaza.id, operator: plaza.operator, highway: plaza.highway, km: toNumberOrNull(plaza.km) });
      candidatesByConcessionaire.set(plaza.operator, list);
    }

    const collectedAt = new Date();

    for (const tariff of tariffs) {
      const candidates = candidatesByConcessionaire.get(tariff.concessionaire) ?? [];

      // Fase 36 -- quando a fonte NAO fornece km por praca (ex:
      // RJ/AGETRANSP: a tarifa e uniforme por concessao, publicada uma
      // unica vez, nunca por praca individual -- ver relatorio da fase),
      // o matching por tolerancia geografica (findMatchingTollPlaza)
      // nunca teria candidato plausivel (km null nunca passa em
      // isPlausibleMatch) -- entao aplica a MESMA tarifa a TODAS as
      // pracas ja conhecidas daquela concessionaria, nunca escolhendo
      // "uma" entre varias (a fonte nao distingue por praca, entao
      // nenhuma seria mais "correta" que outra -- isto NAO e a mesma
      // ambiguidade de identidade que justificaria PENDING_REVIEW no
      // fluxo de pracas). Nunca cria TollPlaza nova em nenhum dos dois
      // casos.
      const matchedPlazaIds: string[] =
        tariff.km === null
          ? candidates.map((candidate) => candidate.id)
          : (() => {
              const outcome = findMatchingTollPlaza(tariff, candidates);
              return outcome.matchedPlazaId ? [outcome.matchedPlazaId] : [];
            })();

      if (matchedPlazaIds.length === 0) {
        recordsRejected += 1;
        continue;
      }

      for (const tollPlazaId of matchedPlazaIds) {
        const outcomeStatus = await this.ratesService.upsertFromAutomatedSource({
          tollPlazaId,
          axleCategory: tariff.axleCategory,
          price: tariff.price,
          currency: tariff.currency,
          sourceId,
          sourceDocument: tariff.sourceDocument,
          sourceReference: tariff.sourceReference,
          collectedAt,
          effectiveFrom: tariff.effectiveFrom,
          status: tariff.status,
        });

        if (outcomeStatus === 'CREATED') recordsCreated += 1;
        else if (outcomeStatus === 'UPDATED') recordsUpdated += 1;
        else recordsUnchanged += 1;
      }
    }

    return { recordsRead: tariffs.length, recordsCreated, recordsUpdated, recordsUnchanged, recordsRejected };
  }

  // ==========================================================================
  // compartilhado
  // ==========================================================================

  private statusFromCounts(result: { recordsCreated: number; recordsUpdated: number; recordsRejected: number }): TollDataSyncStatus {
    if (result.recordsRejected > 0 && result.recordsCreated + result.recordsUpdated === 0) return TollDataSyncStatus.FAILED;
    if (result.recordsRejected > 0) return TollDataSyncStatus.PARTIAL;
    return TollDataSyncStatus.SUCCESS;
  }

  private async finishRun(
    runId: string,
    sourceId: string,
    result: {
      status: TollDataSyncStatus;
      errorMessage: string | null;
      recordsRead: number;
      recordsCreated: number;
      recordsUpdated: number;
      recordsUnchanged: number;
      recordsRejected: number;
    },
  ): Promise<TollDataSyncOutcome> {
    const finishedAt = new Date();
    await this.prisma.tollDataSyncRun.update({
      where: { id: runId },
      data: {
        finishedAt,
        status: result.status,
        recordsRead: result.recordsRead,
        recordsCreated: result.recordsCreated,
        recordsUpdated: result.recordsUpdated,
        recordsUnchanged: result.recordsUnchanged,
        recordsRejected: result.recordsRejected,
        errorMessage: result.errorMessage,
      },
    });
    await this.prisma.tollDataSource.update({
      where: { id: sourceId },
      data: {
        lastSyncAt: finishedAt,
        ...(result.status === TollDataSyncStatus.FAILED
          ? { lastFailureAt: finishedAt, lastError: result.errorMessage }
          : { lastSuccessAt: finishedAt, lastError: null }),
      },
    });
    return { runId, ...result };
  }
}
