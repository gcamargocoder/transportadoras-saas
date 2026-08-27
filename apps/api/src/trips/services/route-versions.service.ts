import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RouteVersionEntity } from '../entities/route-version.entity';
import { toRouteVersionEntity } from '../mappers/route-version.mapper';
import { TripsService } from './trips.service';

// Somente leitura -- RouteVersion e imutavel (ver comentario no schema).
// Toda viagem nasce com exatamente 1 versao (INITIAL, criada junto com a
// viagem). A partir da Fase 89, aplicar uma sugestao de roteirizacao de
// paradas (TripRoutingService.apply) anexa uma nova versao (reason=
// STOP_RESEQUENCE) -- nunca edita uma existente.
@Injectable()
export class RouteVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
  ) {}

  async findAll(tenantId: string, tripId: string): Promise<RouteVersionEntity[]> {
    await this.tripsService.findOwnedOrThrow(tenantId, tripId);

    const versions = await this.prisma.routeVersion.findMany({
      where: { tenantId, tripId },
      orderBy: { versionNumber: 'asc' },
    });
    return versions.map(toRouteVersionEntity);
  }
}
