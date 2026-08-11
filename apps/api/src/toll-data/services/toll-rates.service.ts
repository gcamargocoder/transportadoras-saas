import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TollRate } from '@prisma/client';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditService } from '../../audit/services/audit.service';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { toNumberOrNull } from '../../common/utils/decimal.util';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { resolveEffectiveTollTariff, TollRateCandidate } from '../utils/effective-toll-tariff.util';
import { CreateTollRateDto } from '../dto/create-toll-rate.dto';
import { FindTollRatesQueryDto } from '../dto/find-toll-rates-query.dto';
import { EffectiveTollTariffEntity, PaginatedTollRatesEntity, TollRateEntity } from '../entities/toll-rate.entity';
import { toTollRateEntity } from '../mappers/toll-data.mapper';
import { TollDataSourceService } from './toll-data-source.service';

const RATE_INCLUDE = { tollPlaza: { select: { name: true } }, source: { select: { provider: true } } } satisfies Prisma.TollRateInclude;

// Fase 33, secao 4/13/17/18 -- entrada administrativa rastreavel de tarifa
// oficial (ver relatorio da fase: nenhuma fonte tem tarifa estruturada
// automatizavel ainda) + consulta da tarifa vigente/historica. Reaproveita
// integralmente a tabela TollRate ja existente (nunca criou uma tabela
// paralela) e o motor puro effective-toll-tariff.util.ts.
@Injectable()
export class TollRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sourceService: TollDataSourceService,
  ) {}

  // Entrada administrativa de uma tarifa oficial (secao 31: isto NAO e um
  // "override" de uma tarifa ja existente -- e o MEIO PRIMARIO de registrar
  // tarifas nesta fase, sempre com fonte/documento/data de coleta
  // obrigatorios, ver CreateTollRateDto). Fecha automaticamente a vigencia
  // anterior da MESMA praca+categoria (secao 13: nunca sobrescreve
  // historico).
  async create(
    dto: CreateTollRateDto,
    actorTenantId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<TollRateEntity> {
    const plaza = await this.prisma.tollPlaza.findUnique({ where: { id: dto.tollPlazaId } });
    if (!plaza) {
      throw new NotFoundException('Praca de pedagio (tollPlazaId) nao encontrada.');
    }

    const effectiveFrom = new Date(dto.effectiveFrom);
    const collectedAt = new Date(dto.collectedAt);
    const source = await this.sourceService.ensureSource(dto.provider);

    const siblings = await this.prisma.tollRate.findMany({
      where: { tollPlazaId: dto.tollPlazaId, axleCategory: dto.axleCategory },
      orderBy: { effectiveFrom: 'asc' },
    });

    // Nao aceita duas tarifas conflitantes na mesma vigencia (secao 23) --
    // duplicata exata ja seria rejeitada pelo @@unique, mas aqui damos um
    // erro claro em vez de deixar vazar a excecao bruta do Prisma.
    if (siblings.some((rate) => rate.effectiveFrom.getTime() === effectiveFrom.getTime())) {
      throw new ConflictException(
        'Ja existe uma tarifa para esta praca/categoria com a mesma data de inicio de vigencia.',
      );
    }

    // Fecha a vigencia anterior mais recente (a que comecava antes da nova)
    // e, se ja existir uma vigencia POSTERIOR (backfill historico), fecha a
    // nova tarifa nela -- nunca deixa duas tarifas "abertas" (effectiveUntil
    // nulo) ao mesmo tempo para a mesma praca/categoria.
    const previous = [...siblings].reverse().find((rate) => rate.effectiveFrom.getTime() < effectiveFrom.getTime());
    const next = siblings.find((rate) => rate.effectiveFrom.getTime() > effectiveFrom.getTime());

    const created = await this.prisma.$transaction(async (tx) => {
      if (previous && previous.effectiveUntil === null) {
        await tx.tollRate.update({ where: { id: previous.id }, data: { effectiveUntil: effectiveFrom } });
      }
      return tx.tollRate.create({
        data: {
          tollPlazaId: dto.tollPlazaId,
          axleCategory: dto.axleCategory,
          price: dto.price,
          currency: dto.currency ?? 'BRL',
          effectiveFrom,
          effectiveUntil: next ? next.effectiveFrom : null,
          status: 'VERIFIED', // sempre tem fonte rastreavel -- ver DTO (obrigatorio).
          sourceId: source.id,
          sourceDocument: dto.sourceDocument,
          sourceReference: dto.sourceReference,
          collectedAt,
          createdBy: actor.userId,
        },
        include: RATE_INCLUDE,
      });
    });

    await this.audit.log({
      tenantId: actorTenantId,
      userId: actor.userId,
      action: 'toll_rate.created',
      entityName: 'TollRate',
      entityId: created.id,
      newValue: toJsonSafe({
        tollPlazaId: created.tollPlazaId,
        axleCategory: created.axleCategory,
        price: toNumberOrNull(created.price),
        effectiveFrom: created.effectiveFrom,
        sourceDocument: created.sourceDocument,
      }),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return toTollRateEntity(created);
  }

  async findAll(query: FindTollRatesQueryDto): Promise<PaginatedTollRatesEntity> {
    const where: Prisma.TollRateWhereInput = {
      ...(query.tollPlazaId ? { tollPlazaId: query.tollPlazaId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.tollRate.findMany({
        where,
        include: RATE_INCLUDE,
        orderBy: { effectiveFrom: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tollRate.count({ where }),
    ]);

    const result = new PaginatedTollRatesEntity();
    result.items = items.map(toTollRateEntity);
    result.meta = buildPaginationMeta(total, query.page, query.pageSize);
    return result;
  }

  // GET /toll-data/plazas/:id/tariffs (secao 18) -- historico completo de
  // uma praca (atual + anteriores), mais recente primeiro.
  async findHistoryForPlaza(tollPlazaId: string, pagination: PaginationQueryDto): Promise<PaginatedTollRatesEntity> {
    const plaza = await this.prisma.tollPlaza.findUnique({ where: { id: tollPlazaId } });
    if (!plaza) {
      throw new NotFoundException('Praca de pedagio nao encontrada.');
    }
    return this.findAll({ ...pagination, tollPlazaId });
  }

  // getEffectiveTollTariff() (secao 17) -- nucleo puro em
  // effective-toll-tariff.util.ts; aqui so busca os candidatos (1 query) e
  // delega a decisao.
  async getEffectiveTariff(tollPlazaId: string, axleCategory: string, date: Date): Promise<EffectiveTollTariffEntity> {
    const rates = await this.prisma.tollRate.findMany({ where: { tollPlazaId, axleCategory } });
    return this.resolveToEntity(tollPlazaId, axleCategory, rates, date);
  }

  // Ponto de integracao com o motor de roteirizacao (secao 16/17) --
  // converte axleCount (inteiro, ja usado por AxleConfiguration/AxleEvent)
  // para a mesma convencao de categoria textual ("9 eixos") usada pelas
  // tarifas cadastradas. Nunca reinterpreta o numero de eixos -- so formata.
  async getEffectiveTariffForAxleCount(
    tollPlazaId: string,
    axleCount: number,
    date: Date,
  ): Promise<EffectiveTollTariffEntity> {
    return this.getEffectiveTariff(tollPlazaId, `${axleCount} eixos`, date);
  }

  // Variante em lote de getEffectiveTariffForAxleCount -- usada por
  // RoutingService.persistRoutePlan (secao 16/17) para resolver a tarifa
  // oficial de TODAS as pracas descobertas na rota com 1 unica query, nunca
  // 1 query por praca (mesmo cuidado de performance da Fase 27/33, secao 33).
  async getEffectiveTariffsForAxleCount(
    tollPlazaIds: string[],
    axleCount: number,
    date: Date,
  ): Promise<Map<string, EffectiveTollTariffEntity>> {
    const result = new Map<string, EffectiveTollTariffEntity>();
    if (tollPlazaIds.length === 0) return result;

    const axleCategory = `${axleCount} eixos`;
    const rates = await this.prisma.tollRate.findMany({
      where: { tollPlazaId: { in: tollPlazaIds }, axleCategory },
    });

    const ratesByPlaza = new Map<string, typeof rates>();
    for (const rate of rates) {
      const list = ratesByPlaza.get(rate.tollPlazaId) ?? [];
      list.push(rate);
      ratesByPlaza.set(rate.tollPlazaId, list);
    }

    for (const tollPlazaId of tollPlazaIds) {
      result.set(tollPlazaId, this.resolveToEntity(tollPlazaId, axleCategory, ratesByPlaza.get(tollPlazaId) ?? [], date));
    }
    return result;
  }

  // Fase 35, secao 13/14 (estendido na Fase 36 para RJ/AGETRANSP) --
  // caminho de persistencia usado pela sincronizacao AUTOMATICA (nunca
  // pelo endpoint administrativo, que continua usando create() acima).
  // Diferenca de proposito: create() recebe um effectiveFrom OFICIAL
  // asserido por um humano e rejeita colisao de data; aqui a fonte pode
  // ou nao publicar a vigencia legal real -- quando NAO publica (ex: ANTT
  // por concessao, ver relatorio da Fase 34/35), a UNICA forma segura de
  // detectar "mudou ou nao mudou" e comparar o VALOR contra a tarifa
  // aberta atual, nunca a data, e effectiveFrom cai para o timestamp
  // EXATO da coleta (nunca truncado para o dia -- truncar faria uma
  // segunda mudanca de valor no MESMO dia sobrescrever o valor anterior
  // em vez de versionar, perdendo historico; o timestamp exato de duas
  // chamadas reais nunca colide). Quando a fonte PUBLICA vigencia legal
  // explicita (ex: "Cobranca praticada a partir de" da AGETRANSP, Fase
  // 36), o chamador passa effectiveFrom/status explicitos, usados como
  // vieram -- nunca substituidos pela data de coleta.
  async upsertFromAutomatedSource(input: {
    tollPlazaId: string;
    axleCategory: string;
    price: number;
    currency: string;
    sourceId: string;
    sourceDocument: string;
    sourceReference: string;
    collectedAt: Date;
    /** Fase 36 -- vigencia legal real, quando a fonte publica (ex: RJ). Ausente = usa collectedAt (ex: ANTT). */
    effectiveFrom?: Date | undefined;
    /** Fase 36 -- VERIFIED somente quando a fonte confirma vigencia legal (RJ); padrao PENDING_REVIEW (ANTT). */
    status?: 'VERIFIED' | 'PENDING_REVIEW' | undefined;
  }): Promise<'CREATED' | 'UPDATED' | 'UNCHANGED'> {
    const effectiveFrom = input.effectiveFrom ?? input.collectedAt;
    const status = input.status ?? 'PENDING_REVIEW';
    const priceEquals = (a: number, b: number) => Math.round(a * 100) === Math.round(b * 100);

    const current = await this.prisma.tollRate.findFirst({
      where: { tollPlazaId: input.tollPlazaId, axleCategory: input.axleCategory, effectiveUntil: null },
    });

    if (!current) {
      await this.prisma.tollRate.create({
        data: {
          tollPlazaId: input.tollPlazaId,
          axleCategory: input.axleCategory,
          price: input.price,
          currency: input.currency,
          effectiveFrom,
          effectiveUntil: null,
          status,
          sourceId: input.sourceId,
          sourceDocument: input.sourceDocument,
          sourceReference: input.sourceReference,
          collectedAt: input.collectedAt,
          createdBy: null,
        },
      });
      return 'CREATED';
    }

    if (priceEquals(toNumberOrNull(current.price) ?? 0, input.price)) {
      // Inalterado -- so atualiza os metadados de "confirmado na ultima
      // sincronizacao", nunca cria uma nova linha/vigencia (secao 13).
      await this.prisma.tollRate.update({
        where: { id: current.id },
        data: { collectedAt: input.collectedAt, sourceReference: input.sourceReference },
      });
      return 'UNCHANGED';
    }

    // Mudou: fecha a vigencia atual e cria uma nova (mesmo invariante de
    // create() -- nunca duas vigencias abertas ao mesmo tempo, nunca
    // sobrescreve historico).
    await this.prisma.$transaction([
      this.prisma.tollRate.update({ where: { id: current.id }, data: { effectiveUntil: effectiveFrom } }),
      this.prisma.tollRate.create({
        data: {
          tollPlazaId: input.tollPlazaId,
          axleCategory: input.axleCategory,
          price: input.price,
          currency: input.currency,
          effectiveFrom,
          effectiveUntil: null,
          status,
          sourceId: input.sourceId,
          sourceDocument: input.sourceDocument,
          sourceReference: input.sourceReference,
          collectedAt: input.collectedAt,
          createdBy: null,
        },
      }),
    ]);
    return 'UPDATED';
  }

  private resolveToEntity(
    tollPlazaId: string,
    axleCategory: string,
    rates: TollRate[],
    date: Date,
  ): EffectiveTollTariffEntity {
    const candidates: TollRateCandidate[] = rates.map((rate) => ({
      id: rate.id,
      axleCategory: rate.axleCategory,
      price: toNumberOrNull(rate.price) ?? 0,
      currency: rate.currency,
      effectiveFrom: rate.effectiveFrom,
      effectiveUntil: rate.effectiveUntil,
      status: rate.status,
    }));

    const resolved = resolveEffectiveTollTariff(candidates, axleCategory, date);

    const entity = new EffectiveTollTariffEntity();
    entity.tollPlazaId = tollPlazaId;
    entity.axleCategory = axleCategory;
    entity.rateId = resolved?.rateId ?? null;
    entity.price = resolved?.price ?? null;
    entity.currency = resolved?.currency ?? null;
    entity.effectiveFrom = resolved?.effectiveFrom ?? null;
    entity.effectiveUntil = resolved?.effectiveUntil ?? null;
    entity.status = resolved?.status ?? null;
    return entity;
  }
}
