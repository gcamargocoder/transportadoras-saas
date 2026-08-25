import { Injectable } from '@nestjs/common';
import { Prisma, TripStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FleetAvailabilityStatus, VehicleAvailabilityValue } from '../entities/vehicle.entity';

// Fase 81 -- fonte central da regra de disponibilidade operacional do
// veiculo ("esse veiculo pode ser usado agora?"). Extraida da funcao
// privada que ja existia em vehicle.mapper.ts (Fase 62) para que possa ser
// reutilizada por outros modulos (despacho, manutencao, abastecimento,
// pneus, Driver App), como pedido pela Fase 81 -- nenhuma regra nova,
// mesmo criterio ja usado desde a Fase 41/62: Vehicle.status !== ACTIVE ->
// UNAVAILABLE; ACTIVE + composicao vinculada a Trip IN_PROGRESS/PAUSED ->
// ON_TRIP; ACTIVE sem viagem em andamento -> AVAILABLE.
export const ACTIVE_TRIP_STATUSES: TripStatus[] = [TripStatus.IN_PROGRESS, TripStatus.PAUSED];

export function resolveVehicleAvailability(
  status: VehicleStatus,
  onTrip: boolean,
): VehicleAvailabilityValue {
  if (status !== VehicleStatus.ACTIVE) return 'UNAVAILABLE';
  return onTrip ? 'ON_TRIP' : 'AVAILABLE';
}

export interface FleetAvailabilityResolution {
  status: FleetAvailabilityStatus;
  reason: string | null;
}

// Fase 86 -- mesma fonte/precedencia de resolveVehicleAvailability acima
// (qualquer Vehicle.status != ACTIVE vence onTrip, nunca o contrario), apenas
// com granularidade maior para exibicao (disponivel/em viagem/em
// manutencao/inativo/indisponivel) + motivo textual quando ha indisponibilidade.
// MAINTENANCE reaproveita a sincronizacao ja existente de
// VehiclesService.syncStatusForMaintenance (Fase 63) -- nenhuma consulta
// adicional a VehicleMaintenance e necessaria aqui, o status ja reflete a OS
// aberta. SUSPENDED e SOLD sao agrupados em UNAVAILABLE (mesma taxonomia
// pedida pela Fase 86: disponivel/em viagem/em manutencao/indisponivel/inativo
// -- 5 categorias, nao 6), cada um com seu proprio motivo.
export function resolveFleetAvailabilityStatus(
  status: VehicleStatus,
  onTrip: boolean,
): FleetAvailabilityResolution {
  switch (status) {
    case VehicleStatus.INACTIVE:
      return { status: 'INACTIVE', reason: 'Veiculo inativo.' };
    case VehicleStatus.MAINTENANCE:
      return { status: 'MAINTENANCE', reason: 'Veiculo em manutencao (ordem de servico em andamento).' };
    case VehicleStatus.SUSPENDED:
      return { status: 'UNAVAILABLE', reason: 'Veiculo suspenso administrativamente.' };
    case VehicleStatus.SOLD:
      return { status: 'UNAVAILABLE', reason: 'Veiculo vendido.' };
    case VehicleStatus.ACTIVE:
    default:
      return onTrip ? { status: 'ON_TRIP', reason: null } : { status: 'AVAILABLE', reason: null };
  }
}

// Fragmento Prisma reaproveitavel: veiculo com composicao vinculada a uma
// viagem fisicamente ativa agora. Mesmo criterio usado por
// VehiclesService/VehicleOverviewService/FleetOperationsMetricsService --
// exportado aqui para quem precisar montar o proprio `where` (ex.: dashboards
// que combinam esse fragmento com outros filtros).
export function onTripWhereFragment(): Prisma.VehicleWhereInput {
  return { tripCompositions: { some: { trip: { status: { in: ACTIVE_TRIP_STATUSES } } } } };
}

@Injectable()
export class VehicleAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async isOnTrip(tenantId: string, vehicleId: string): Promise<boolean> {
    const count = await this.prisma.vehicle.count({
      where: { tenantId, id: vehicleId, ...onTripWhereFragment() },
    });
    return count > 0;
  }

  // Resposta central para "esse veiculo pode ser usado agora?" -- pensada
  // para reuso futuro por despacho/maintenance/fuel/tires/Driver App
  // (secao 5 da Fase 81). TripsService.assertCanStart mantem sua propria
  // validacao (mais especifica: sobreposicao por JANELA DE DATA, nao so
  // estado atual) -- decisao documentada em docs/fleet-operations.md, para
  // nao arriscar regressao num caminho critico ja testado.
  async getAvailability(
    tenantId: string,
    vehicleId: string,
  ): Promise<{ availability: VehicleAvailabilityValue; canBeUsedNow: boolean }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { tenantId, id: vehicleId, deletedAt: null },
      select: { status: true },
    });
    if (!vehicle) {
      return { availability: 'UNAVAILABLE', canBeUsedNow: false };
    }
    const onTrip =
      vehicle.status === VehicleStatus.ACTIVE ? await this.isOnTrip(tenantId, vehicleId) : false;
    const availability = resolveVehicleAvailability(vehicle.status, onTrip);
    return { availability, canBeUsedNow: availability === 'AVAILABLE' };
  }
}
