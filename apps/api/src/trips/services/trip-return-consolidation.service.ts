import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TripLoadStatus, TripStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TripFinancialResultEntity } from '../../trip-settlements/entities/trip-financial-result.entity';
import { TripSettlementsService } from '../../trip-settlements/services/trip-settlements.service';
import {
  ConsolidatedLegEntity,
  TripReturnConsolidationEntity,
} from '../entities/trip-return-consolidation.entity';

const LEG_INCLUDE = {
  origin: { select: { name: true } },
  destination: { select: { name: true } },
} satisfies Prisma.TripInclude;

type LegRow = Prisma.TripGetPayload<{ include: typeof LEG_INCLUDE }>;

// Fase E -- consolidacao DERIVADA e somente-leitura de uma viagem de IDA +
// seus RETORNOS diretamente vinculados por Trip.previousTripId (Fase D).
//
// Nao persiste nada. Nao cria model/agrupador. Nao infere ida/retorno por
// veiculo/motorista/horario/origem-destino/GPS/proximidade -- uma viagem so
// entra no par quando previousTripId aponta EXPLICITAMENTE para a ida.
//
// O financeiro por perna e delegado INTEGRALMENTE a
// TripSettlementsService.getFinancialResult (mesma regra ja usada em
// GET /trips/:id/financial-result) -- este service so SOMA em memoria os
// valores que ja existem. Nunca faz join com fan-out (que inflaria somas):
// 1 query para a ida + seus retornos, depois getFinancialResult por perna
// em paralelo -- o numero de queries cresce com a quantidade de RETORNOS
// diretamente vinculados (bounded, tipicamente 1-3), nunca com o tamanho do
// tenant.
@Injectable()
export class TripReturnConsolidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripSettlementsService: TripSettlementsService,
  ) {}

  async getConsolidation(
    tenantId: string,
    outboundTripId: string,
  ): Promise<TripReturnConsolidationEntity> {
    const outbound = await this.prisma.trip.findFirst({
      where: { id: outboundTripId, tenantId, deletedAt: null },
      include: {
        ...LEG_INCLUDE,
        // Retornos diretamente vinculados (Trip.previousTripId = outbound.id).
        // Uma ida PODE ter multiplos retornos -- previousTripId nao e unique.
        returnTrips: {
          where: { deletedAt: null },
          include: LEG_INCLUDE,
          orderBy: [{ plannedDeparture: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!outbound) {
      throw new NotFoundException('Viagem (tripId) nao encontrada nesta empresa.');
    }

    const returnRows = outbound.returnTrips;
    const legRows: LegRow[] = [outbound, ...returnRows];

    // Financeiro por perna: MESMA regra de GET /trips/:id/financial-result,
    // nunca recalculada aqui. Em paralelo -- bounded pela quantidade de
    // retornos vinculados, nunca por linhas de despesa/pedagio/etc.
    const financialResults = await Promise.all(
      legRows.map((leg) => this.tripSettlementsService.getFinancialResult(tenantId, leg.id)),
    );

    const outboundLeg = this.toLeg(outbound, 'OUTBOUND', financialResults[0]!);
    const returnLegs = returnRows.map((row, index) =>
      this.toLeg(row, 'RETURN', financialResults[index + 1]!),
    );
    const allLegs = [outboundLeg, ...returnLegs];

    const entity = new TripReturnConsolidationEntity();
    entity.outboundTripId = outbound.id;
    entity.legCount = allLegs.length;
    entity.returnLegCount = returnLegs.length;
    entity.outbound = outboundLeg;
    entity.returns = returnLegs;

    // Distancia: SOMENTE pernas CONCLUIDAS com distancia real apurada
    // (TripMetrics.actualDistanceKm). Null quando nenhuma qualifica -- nunca
    // estimada, nunca 0 fabricado.
    const completedDistances = allLegs
      .filter((leg) => leg.status === TripStatus.COMPLETED && leg.financialResult.distanceKm !== null)
      .map((leg) => leg.financialResult.distanceKm as number);
    entity.totalCompletedDistanceKm =
      completedDistances.length > 0 ? sum(completedDistances) : null;

    // Custo: sempre disponivel (agregacoes retornam 0 para vazio) -- soma
    // real dos custos por perna.
    entity.totalCost = sum(allLegs.map((leg) => leg.financialResult.totalCost));

    // Receita contratada: soma APENAS das pernas que TEM valor comercial;
    // null quando NENHUMA tem -- nunca somada como 0.
    const contracted = allLegs
      .map((leg) => leg.financialResult.contractedRevenue)
      .filter((value): value is number => value !== null);
    entity.legsWithContractedRevenue = contracted.length;
    entity.revenueComplete = contracted.length === allLegs.length;
    entity.totalContractedRevenue = contracted.length > 0 ? sum(contracted) : null;

    entity.totalInvoicedRevenue = sum(allLegs.map((leg) => leg.financialResult.invoicedRevenue));
    entity.totalReceivedRevenue = sum(allLegs.map((leg) => leg.financialResult.receivedRevenue));

    entity.consolidatedOperatingResult =
      entity.totalContractedRevenue !== null
        ? entity.totalContractedRevenue - entity.totalCost
        : null;
    entity.consolidatedInvoicedResult = entity.totalInvoicedRevenue - entity.totalCost;
    entity.consolidatedReceivedResult = entity.totalReceivedRevenue - entity.totalCost;

    return entity;
  }

  private toLeg(
    row: LegRow,
    role: 'OUTBOUND' | 'RETURN',
    financialResult: TripFinancialResultEntity,
  ): ConsolidatedLegEntity {
    const leg = new ConsolidatedLegEntity();
    leg.tripId = row.id;
    leg.role = role;
    leg.status = row.status;
    leg.originName = row.origin.name;
    leg.destinationName = row.destination.name;
    leg.plannedDeparture = row.plannedDeparture;
    leg.actualDeparture = row.actualDeparture;
    leg.actualArrival = row.actualArrival;
    leg.previousTripId = row.previousTripId;
    leg.loadStatus = row.loadStatus;
    leg.plannedLoadStatus = row.plannedLoadStatus;
    leg.loadCondition = resolveLoadCondition(row.loadStatus);
    leg.financialResult = financialResult;
    return leg;
  }
}

// Deriva a condicao de carga EXCLUSIVAMENTE do loadStatus REAL da largada.
// plannedLoadStatus NUNCA e considerado aqui (regra Fase D/E).
function resolveLoadCondition(loadStatus: TripLoadStatus | null): 'LOADED' | 'EMPTY' | 'UNKNOWN' {
  if (loadStatus === TripLoadStatus.LOADED) return 'LOADED';
  if (loadStatus === TripLoadStatus.EMPTY) return 'EMPTY';
  return 'UNKNOWN';
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
