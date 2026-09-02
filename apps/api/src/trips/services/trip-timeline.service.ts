import { Injectable } from '@nestjs/common';
import { FiscalDocumentType } from '@prisma/client';
import { buildPaginationMeta } from '../../common/entities/pagination-meta.entity';
import { PrismaService } from '../../prisma/prisma.service';
import { FindTripTimelineQueryDto } from '../dto/find-trip-timeline-query.dto';
import { PaginatedTripTimelineEntity, TripTimelineEventEntity, TripTimelineOrigin } from '../entities/trip-timeline-event.entity';
import { TripsService } from './trips.service';

// Rotulos das acoes de auditoria da propria viagem (origin=TRIP/AUDIT) --
// mesmo vocabulario ja usado no frontend antes desta fase (ver
// timeline-tab.tsx ACTION_LABELS, agora centralizado aqui: o backend passa
// a ser a fonte do rotulo, o frontend so exibe).
const TRIP_AUDIT_ACTION_LABELS: Record<string, string> = {
  'trip.created': 'Viagem criada',
  'trip.driver_linked': 'Motorista vinculado',
  'trip.vehicle_linked': 'Veiculo vinculado',
  'trip.updated': 'Planejamento atualizado',
  'trip.waiting_driver': 'Aguardando motorista',
  'trip.waiting_departure': 'Aguardando saida',
  'trip.started': 'Viagem iniciada',
  'trip.paused': 'Viagem pausada',
  'trip.resumed': 'Viagem retomada',
  'trip.arrived': 'Chegada ao destino',
  'trip.completed': 'Viagem concluida',
  'trip.cancelled': 'Viagem cancelada',
  'trip.deleted': 'Viagem excluida',
};

// Fase 67 -- evolui GET /trips/:id/timeline: antes so devolvia AuditLog
// (Fase 28), agora agrega TODOS os eventos reais ja registrados para esta
// viagem em outras tabelas, numa projecao em memoria. NUNCA uma segunda
// fonte de verdade -- nada e persistido aqui, so lido e normalizado.
//
// N+1: sempre um numero FIXO de queries em paralelo (uma por origem, ~11),
// nunca uma consulta por evento -- o volume de LINHAS cresce com o total de
// eventos da viagem (esperado), a CONTAGEM DE QUERIES nao.
@Injectable()
export class TripTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
  ) {}

  async getTimeline(
    tenantId: string,
    tripId: string,
    query: FindTripTimelineQueryDto,
  ): Promise<PaginatedTripTimelineEntity> {
    await this.tripsService.findOwnedOrThrow(tenantId, tripId);

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : null;

    const allItems = await this.collectAllEvents(tenantId, tripId);

    const filtered = allItems.filter((item) => {
      if (query.origin && item.origin !== query.origin) return false;
      if (query.type && item.type !== query.type) return false;
      if (from && item.occurredAt < from) return false;
      if (to && item.occurredAt > to) return false;
      return true;
    });

    const order = query.order ?? 'desc';
    filtered.sort((a, b) => {
      const diff = a.occurredAt.getTime() - b.occurredAt.getTime();
      if (diff !== 0) return order === 'asc' ? diff : -diff;
      // Desempate deterministico quando dois eventos tem o MESMO instante:
      // por origem e depois por id, nunca pela ordem de insercao no array
      // (que dependeria da ordem de resolucao das promises).
      const originDiff = a.origin.localeCompare(b.origin);
      if (originDiff !== 0) return originDiff;
      return a.id.localeCompare(b.id);
    });

    const page = query.page;
    const pageSize = query.pageSize;
    const total = filtered.length;
    const items = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    const result = new PaginatedTripTimelineEntity();
    result.items = items;
    result.meta = buildPaginationMeta(total, page, pageSize);
    return result;
  }

  private async collectAllEvents(tenantId: string, tripId: string): Promise<TripTimelineEventEntity[]> {
    const [
      stops,
      routeEvents,
      fuelSupplies,
      tollTransactions,
      axleEvents,
      checklists,
      fiscalDocuments,
      expenses,
      revenues,
      occurrences,
      idlePeriods,
      auditLogs,
    ] = await Promise.all([
      this.prisma.tripStop.findMany({ where: { tenantId, tripId } }),
      this.prisma.routeEvent.findMany({ where: { tenantId, tripId } }),
      this.prisma.fuelSupply.findMany({ where: { tenantId, tripId } }),
      this.prisma.tollTransaction.findMany({ where: { tenantId, tripId } }),
      this.prisma.axleEvent.findMany({ where: { tenantId, tripId } }),
      this.prisma.checklistExecution.findMany({ where: { tenantId, tripId } }),
      this.prisma.fiscalDocument.findMany({ where: { tenantId, tripId } }),
      this.prisma.tripExpense.findMany({ where: { tenantId, tripId } }),
      this.prisma.tripRevenue.findMany({ where: { tenantId, tripId } }),
      this.prisma.tripOccurrence.findMany({ where: { tenantId, tripId } }),
      // Fase B -- periodos ociosos abertos por esta viagem (tripBeforeId) ou
      // fechados por ela (tripAfterId). Numero FIXO de queries (uma a mais),
      // nunca 1 por evento.
      this.prisma.vehicleIdlePeriod.findMany({
        where: { tenantId, OR: [{ tripBeforeId: tripId }, { tripAfterId: tripId }] },
      }),
      this.prisma.auditLog.findMany({ where: { tenantId, entityName: 'Trip', entityId: tripId } }),
    ]);

    const events: TripTimelineEventEntity[] = [];

    for (const stop of stops) {
      events.push(
        this.buildEvent(stop.id, 'STOP', stop.type, 'Parada operacional', stop.locationLabel ?? stop.notes, stop.startedAt),
      );
    }

    for (const event of routeEvents) {
      events.push(this.buildEvent(event.id, 'ROUTE_EVENT', event.type, 'Evento de rota', null, event.detectedAt));
    }

    for (const supply of fuelSupplies) {
      events.push(
        this.buildEvent(supply.id, 'FUEL', null, 'Abastecimento registrado', `${supply.liters.toString()} L`, supply.supplyDate),
      );
    }

    for (const toll of tollTransactions) {
      events.push(
        this.buildEvent(toll.id, 'TOLL', null, 'Pedagio cobrado', `R$ ${toll.chargedAmount.toString()}`, toll.chargedAt),
      );
    }

    for (const axle of axleEvents) {
      events.push(
        this.buildEvent(axle.id, 'AXLE', null, 'Excecao de eixos', axle.endedAt ? 'Encerrada' : 'Em aberto', axle.startedAt),
      );
    }

    for (const checklist of checklists) {
      events.push(
        this.buildEvent(checklist.id, 'CHECKLIST', checklist.status, 'Checklist iniciado', null, checklist.startedAt),
      );
    }

    for (const doc of fiscalDocuments) {
      const isDeliveryProof = doc.documentType === FiscalDocumentType.DELIVERY_PROOF;
      const metadata = (doc.metadata as Record<string, unknown> | null) ?? null;
      const observation = typeof metadata?.observation === 'string' ? metadata.observation : null;
      events.push(
        this.buildEvent(
          doc.id,
          isDeliveryProof ? 'DELIVERY_PROOF' : 'FISCAL',
          doc.documentType,
          isDeliveryProof ? 'Comprovante de entrega registrado' : `Documento fiscal: ${doc.documentType}`,
          observation,
          doc.issueDate ?? doc.createdAt,
        ),
      );
    }

    for (const expense of expenses) {
      events.push(
        this.buildEvent(expense.id, 'EXPENSE', null, 'Despesa registrada', `${expense.description} - R$ ${expense.amount.toString()}`, expense.expenseDate),
      );
    }

    for (const revenue of revenues) {
      events.push(
        this.buildEvent(revenue.id, 'REVENUE', null, 'Receita registrada', `${revenue.description} - R$ ${revenue.amount.toString()}`, revenue.receivedAt),
      );
    }

    for (const occurrence of occurrences) {
      const statusLabel = occurrence.cancelledAt ? 'Cancelada' : occurrence.resolvedAt ? 'Resolvida' : 'Em aberto';
      const item = this.buildEvent(
        occurrence.id,
        'OCCURRENCE',
        occurrence.type,
        `Ocorrencia: ${occurrence.type}`,
        `${occurrence.description} (${statusLabel})`,
        occurrence.occurredAt,
      );
      item.severity = occurrence.severity;
      events.push(item);
    }

    for (const period of idlePeriods) {
      const durationLabel = period.durationMinutes !== null ? ` (${period.durationMinutes} min)` : '';
      // Fase C -- quando o proprio motorista informou/confirmou o motivo pelo
      // app, source=DRIVER_APP. Nao e um evento novo (rule 11 -- so os
      // realmente necessarios): so enriquece a descricao do "iniciado".
      const originLabel =
        period.source === 'DRIVER_APP'
          ? ' Motivo informado pelo motorista.'
          : period.source === 'MANUAL_ADMIN'
            ? ' Registrado manualmente pela operacao.'
            : '';
      if (period.tripBeforeId === tripId) {
        events.push(
          this.buildEvent(
            period.id,
            'IDLE_PERIOD',
            period.reason,
            'Periodo parado iniciado',
            `Veiculo sem viagem apos a conclusao. Motivo: ${period.reason}${period.endedAt ? `. Encerrado depois${durationLabel}` : ' (em aberto)'}.${originLabel}`,
            period.startedAt,
          ),
        );
      } else if (period.tripAfterId === tripId && period.endedAt) {
        events.push(
          this.buildEvent(
            period.id,
            'IDLE_PERIOD',
            period.reason,
            'Periodo parado encerrado',
            `Veiculo retomou operacao. Motivo do periodo: ${period.reason}${durationLabel}. Viagem anterior: ${period.tripBeforeId ?? '—'}.`,
            period.endedAt,
          ),
        );
      }
    }

    for (const log of auditLogs) {
      events.push(
        this.buildEvent(log.id, 'AUDIT', log.action, TRIP_AUDIT_ACTION_LABELS[log.action] ?? log.action, null, log.createdAt),
      );
    }

    return events;
  }

  private buildEvent(
    id: string,
    origin: TripTimelineOrigin,
    type: string | null,
    label: string,
    description: string | null,
    occurredAt: Date,
  ): TripTimelineEventEntity {
    const item = new TripTimelineEventEntity();
    item.id = id;
    item.origin = origin;
    item.type = type;
    item.label = label;
    item.description = description;
    item.severity = null;
    item.occurredAt = occurredAt;
    return item;
  }
}
