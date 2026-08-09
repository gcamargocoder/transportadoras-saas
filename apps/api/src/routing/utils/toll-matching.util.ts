import { GeoPoint } from '../../common/utils/geo.util';
import {
  computeBoundingBox,
  cumulativeDistancesMeters,
  distanceToPolylineMeters,
  isWithinBoundingBox,
  nearestPointOnPolyline,
} from './route-geometry.util';

// Candidato a praca (projecao minima de TollPlaza -- ver mapeamento no
// RoutingService). Fica desacoplado do tipo do Prisma de proposito, para o
// algoritmo continuar puro/testavel sem banco.
export interface TollPlazaCandidate {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  pricePerAxle: number | null;
}

export interface DiscoveredToll {
  tollPlazaId: string;
  name: string;
  latitude: number;
  longitude: number;
  sequence: number;
  distanceFromOriginMeters: number;
  distanceToRouteMeters: number;
  /** 0..1 -- 1 = praca exatamente sobre a rota, 0 = na borda da tolerancia. */
  matchConfidence: number;
}

// Descobre pracas de pedagio ao longo de uma rota CRUZANDO a geometria
// (polyline decodificada) com o catalogo de TollPlaza -- nao o inverso (ver
// comentario no schema em RoutePlanToll sobre a limitacao da Google Routes
// API nesta fase). Pura: recebe candidatos ja carregados do banco, nao
// consulta nada. Ordena pelo ponto da rota mais proximo de cada praca
// (origem -> praca A -> praca B -> ... -> destino), nunca pela ordem de
// entrada dos candidatos.
export function discoverTollsAlongRoute(
  polyline: GeoPoint[],
  candidates: TollPlazaCandidate[],
  toleranceMeters: number,
): DiscoveredToll[] {
  if (polyline.length === 0 || candidates.length === 0) return [];

  const boundingBox = computeBoundingBox(polyline, toleranceMeters);
  if (!boundingBox) return [];

  const cumulative = cumulativeDistancesMeters(polyline);

  const discovered: Omit<DiscoveredToll, 'sequence'>[] = [];
  for (const candidate of candidates) {
    const point: GeoPoint = { latitude: candidate.latitude, longitude: candidate.longitude };
    if (!isWithinBoundingBox(point, boundingBox)) continue;

    const distanceToRouteMeters = distanceToPolylineMeters(point, polyline);
    if (distanceToRouteMeters > toleranceMeters) continue;

    const nearest = nearestPointOnPolyline(point, polyline);
    const matchConfidence = clamp01(1 - distanceToRouteMeters / toleranceMeters);

    discovered.push({
      tollPlazaId: candidate.id,
      name: candidate.name,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      distanceFromOriginMeters: Math.round(cumulative[nearest.index] ?? 0),
      distanceToRouteMeters: Math.round(distanceToRouteMeters),
      matchConfidence: Math.round(matchConfidence * 1000) / 1000,
    });
  }

  return discovered
    .sort((a, b) => a.distanceFromOriginMeters - b.distanceFromOriginMeters)
    .map((toll, index) => ({ ...toll, sequence: index + 1 }));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
