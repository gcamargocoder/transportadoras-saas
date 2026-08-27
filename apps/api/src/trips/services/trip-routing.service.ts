import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/services/audit.service';
import { RequestMetadata } from '../../auth/utils/request-metadata.util';
import { AuditActor } from '../../common/interfaces/audit-actor.interface';
import { toJsonSafe } from '../../common/utils/to-json-safe.util';
import { PrismaService } from '../../prisma/prisma.service';
import { RoutingService } from '../../routing/services/routing.service';
import {
  ApplyTripRoutingSuggestionEntity,
  TripRoutingSuggestionEntity,
  TripRoutingSuggestionItemEntity,
} from '../entities/trip-routing-suggestion.entity';
import { TripDeliveryStopEntity } from '../entities/trip-delivery-stop.entity';
import { assertTripPlanningAllowed } from '../utils/trip-planning-lock.util';
import { TripDeliveryStopsService } from './trip-delivery-stops.service';
import { TripsService } from './trips.service';

// Fase 89 -- motor de roteirizacao operacional das paradas/entregas de uma
// viagem (TripDeliveryStop, Fase 88). LIMITACAO REAL desta instalacao (ver
// docs/trip-routing.md, secao "Limitacoes"): nenhuma coordenada geografica e
// capturada para Location (CreateLocationDto nunca expoe geoPoint) e o
// RoutingProviderPort existente (Fase 26, ver RoutingModule) foi desenhado
// para UM UNICO trecho origem->destino da viagem inteira (RoutePlan/pedagio),
// nunca para roteirizar N paradas intermediarias -- estender isso exigiria
// N chamadas externas por sugestao (custo/latencia relevantes) e comecaria a
// se parecer com otimizacao de frota (fora do escopo desta fase, regra 11).
// Por isso o motor real e possivel hoje ordena pelo UNICO dado ja existente
// e nunca inventado que informa proximidade temporal entre entregas:
// TripDeliveryStop.plannedArrival (informado manualmente no planejamento,
// Fase 88) -- paradas sem previsao mantem sua posicao relativa atual, sempre
// apos as que tem previsao. distanceMeters/durationSeconds sao SEMPRE null
// (nunca inventados) -- ver TripRoutingSuggestionEntity.
@Injectable()
export class TripRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tripsService: TripsService,
    private readonly tripDeliveryStopsService: TripDeliveryStopsService,
    private readonly routingService: RoutingService,
  ) {}

  // GET .../delivery-stops/routing-suggestion -- puramente de leitura, nunca
  // altera TripDeliveryStop.sequence (regra 4: nenhuma sobrescrita sem acao
  // explicita). Permitido em qualquer status de viagem (ver visao geral em
  // docs/trip-routing.md) -- so a APLICACAO (abaixo) respeita a trava de
  // planejamento. findAllForTrip ja valida tenant/existencia da viagem
  // (NotFoundException) -- nunca uma segunda checagem de propriedade aqui.
  async suggest(tenantId: string, tripId: string): Promise<TripRoutingSuggestionEntity> {
    const stops = await this.tripDeliveryStopsService.findAllForTrip(tenantId, tripId);
    return this.buildSuggestion(tripId, stops);
  }

  // POST .../delivery-stops/routing-suggestion/apply -- recalcula a sugestao
  // no MOMENTO da aplicacao (nunca confia num calculo antigo enviado pelo
  // cliente) e a aplica via o MESMO TripDeliveryStopsService.reorder ja
  // validado/testado na Fase 88 (valida que items cobre exatamente as
  // paradas do tenant/viagem -- regra 7 -- e forma 1..N sem lacunas/
  // duplicatas -- regra 6). Quando a sugestao ja e igual a sequencia atual,
  // e um no-op idempotente: nenhuma escrita, nenhum RouteVersion novo
  // (regra 5 -- so versiona quando algo de fato mudou).
  async apply(
    tenantId: string,
    tripId: string,
    actor: AuditActor,
    metadata: RequestMetadata,
  ): Promise<ApplyTripRoutingSuggestionEntity> {
    const trip = await this.tripsService.findOwnedOrThrow(tenantId, tripId);
    assertTripPlanningAllowed(trip);

    const stops = await this.tripDeliveryStopsService.findAllForTrip(tenantId, tripId);
    const suggestion = this.buildSuggestion(tripId, stops);

    const result = new ApplyTripRoutingSuggestionEntity();
    if (!suggestion.changed) {
      result.applied = false;
      result.routeVersionId = null;
      result.routeVersionNumber = null;
      return result;
    }

    const items = suggestion.items.map((item) => ({
      id: item.stopId,
      sequence: item.suggestedSequence,
    }));
    await this.tripDeliveryStopsService.reorder(tenantId, tripId, { items }, actor, metadata);

    // Reaproveita RouteVersion (Fase 23/26) -- ja documentado como o lugar
    // certo para acumular "replanejamentos" de uma viagem (regra 3); nenhuma
    // geometria e gravada aqui (nunca calculada nesta fase), so o marco
    // historico de que a sequencia de paradas foi reordenada por sugestao.
    const routeVersion = await this.prisma.$transaction(async (tx) => {
      const last = await tx.routeVersion.findFirst({
        where: { tenantId, tripId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
      });
      return tx.routeVersion.create({
        data: {
          tenantId,
          tripId,
          versionNumber: (last?.versionNumber ?? 0) + 1,
          reason: 'STOP_RESEQUENCE',
        },
      });
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      action: 'trip_delivery_stop.routing_applied',
      entityName: 'RouteVersion',
      entityId: routeVersion.id,
      previousValue: toJsonSafe(Object.fromEntries(stops.map((s) => [s.id, s.sequence]))),
      newValue: toJsonSafe(Object.fromEntries(items.map((i) => [i.id, i.sequence]))),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    result.applied = true;
    result.routeVersionId = routeVersion.id;
    result.routeVersionNumber = routeVersion.versionNumber;
    return result;
  }

  // Puro -- nunca consulta o banco (recebe as paradas ja carregadas em lote
  // por TripDeliveryStopsService.findAllForTrip, 2 queries fixas
  // independente do numero de paradas, ver Fase 88). Determinismo: mesma
  // entrada sempre produz a mesma sugestao.
  private buildSuggestion(tripId: string, stops: TripDeliveryStopEntity[]): TripRoutingSuggestionEntity {
    const withEta = stops
      .filter((s) => s.plannedArrival !== null)
      .sort((a, b) => a.plannedArrival!.getTime() - b.plannedArrival!.getTime());
    const withoutEta = stops.filter((s) => s.plannedArrival === null);
    const ordered = [...withEta, ...withoutEta];
    const changed = ordered.some((s, index) => s.id !== stops[index]?.id);

    const items: TripRoutingSuggestionItemEntity[] = ordered.map((stop, index) => {
      const item = new TripRoutingSuggestionItemEntity();
      item.stopId = stop.id;
      item.currentSequence = stop.sequence;
      item.suggestedSequence = index + 1;
      item.customerName = stop.customerName;
      item.locationName = stop.locationName;
      item.locationAddress = stop.locationAddress;
      item.plannedArrival = stop.plannedArrival;
      item.hasAddress = Boolean(stop.locationAddress);
      return item;
    });

    const routingProviderConfigured = this.routingService.isProviderConfigured();
    const limitations: string[] = [
      'Distância e tempo entre as paradas não são calculados nesta instalação: os locais ' +
        'cadastrados (Location) não possuem coordenadas geográficas capturadas' +
        (routingProviderConfigured
          ? ', e o provedor de roteirização configurado ainda não é usado para múltiplas entregas nesta fase.'
          : ' e nenhum provedor de roteirização geográfica está configurado nesta instalação.') +
        ' A sequência sugerida usa a previsão de chegada informada manualmente em cada parada.',
    ];
    const withoutAddress = stops.filter((s) => !s.locationAddress);
    if (withoutAddress.length > 0) {
      limitations.push(
        `${withoutAddress.length} parada(s) sem endereço cadastrado no local: ` +
          `${withoutAddress.map((s) => s.locationName).join(', ')}.`,
      );
    }
    if (stops.length < 2) {
      limitations.push('Menos de duas paradas cadastradas — não há o que reordenar.');
    }

    const entity = new TripRoutingSuggestionEntity();
    entity.tripId = tripId;
    entity.generatedAt = new Date();
    entity.changed = changed;
    entity.items = items;
    entity.distanceMeters = null;
    entity.durationSeconds = null;
    entity.routingProviderConfigured = routingProviderConfigured;
    entity.limitations = limitations;
    return entity;
  }
}
