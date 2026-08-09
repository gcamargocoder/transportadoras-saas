import { GeoPoint, haversineDistanceMeters } from '../../common/utils/geo.util';

// Aproximacao deliberada: distancia ao VERTICE mais proximo da polyline, nao
// a projecao exata no segmento mais proximo. Suficiente para os propositos
// desta fase (corredor de poucas centenas de metros / deteccao de desvio na
// ordem de centenas de metros) porque a polyline devolvida pelo provider e
// densa (um vertice a cada poucas dezenas de metros em rodovia) -- o erro
// introduzido por essa aproximacao fica bem abaixo das tolerancias
// configuradas (ROUTING_TOLL_MATCH_RADIUS_METERS, TenantSettings.maxDeviationMeters).
// Documentado aqui de proposito para nao ser confundido com um calculo exato.
export interface NearestPointResult {
  distanceMeters: number;
  index: number;
}

export function nearestPointOnPolyline(point: GeoPoint, polyline: GeoPoint[]): NearestPointResult {
  let best: NearestPointResult = { distanceMeters: Infinity, index: -1 };
  for (let i = 0; i < polyline.length; i += 1) {
    const distance = haversineDistanceMeters(point, polyline[i]!);
    if (distance < best.distanceMeters) {
      best = { distanceMeters: distance, index: i };
    }
  }
  return best;
}

export function distanceToPolylineMeters(point: GeoPoint, polyline: GeoPoint[]): number {
  if (polyline.length === 0) return Infinity;
  return nearestPointOnPolyline(point, polyline).distanceMeters;
}

// Distancia acumulada (metros) da origem (indice 0) ate cada vertice --
// calculada uma vez por RoutePlan e reaproveitada tanto para ordenar pedagios
// descobertos quanto para estimar "distancia desde a origem" de um ponto.
export function cumulativeDistancesMeters(polyline: GeoPoint[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < polyline.length; i += 1) {
    cumulative.push(cumulative[i - 1]! + haversineDistanceMeters(polyline[i - 1]!, polyline[i]!));
  }
  return cumulative;
}

// Distancia (metros) desde a origem da rota ate o ponto mais proximo da
// polyline ao ponto informado -- usado para ordenar pedagios descobertos
// (origem -> praca A -> praca B -> ... -> destino).
export function distanceFromOriginMeters(
  point: GeoPoint,
  polyline: GeoPoint[],
  cumulative: number[],
): number {
  const nearest = nearestPointOnPolyline(point, polyline);
  return nearest.index >= 0 ? (cumulative[nearest.index] ?? 0) : 0;
}

// Caixa delimitadora da polyline com margem (em metros, convertida para
// graus por uma aproximacao simples) -- usada como filtro barato antes do
// calculo preciso de distancia, evitando varrer TODAS as pracas do catalogo
// global contra TODOS os vertices da rota.
export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

const METERS_PER_DEGREE_LATITUDE = 111_320;

export function computeBoundingBox(polyline: GeoPoint[], paddingMeters: number): BoundingBox | null {
  if (polyline.length === 0) return null;

  let minLatitude = polyline[0]!.latitude;
  let maxLatitude = polyline[0]!.latitude;
  let minLongitude = polyline[0]!.longitude;
  let maxLongitude = polyline[0]!.longitude;

  for (const point of polyline) {
    if (point.latitude < minLatitude) minLatitude = point.latitude;
    if (point.latitude > maxLatitude) maxLatitude = point.latitude;
    if (point.longitude < minLongitude) minLongitude = point.longitude;
    if (point.longitude > maxLongitude) maxLongitude = point.longitude;
  }

  const latPadding = paddingMeters / METERS_PER_DEGREE_LATITUDE;
  const lonPadding =
    paddingMeters / (METERS_PER_DEGREE_LATITUDE * Math.cos((maxLatitude * Math.PI) / 180) || 1);

  return {
    minLatitude: minLatitude - latPadding,
    maxLatitude: maxLatitude + latPadding,
    minLongitude: minLongitude - lonPadding,
    maxLongitude: maxLongitude + lonPadding,
  };
}

export function isWithinBoundingBox(point: GeoPoint, box: BoundingBox): boolean {
  return (
    point.latitude >= box.minLatitude &&
    point.latitude <= box.maxLatitude &&
    point.longitude >= box.minLongitude &&
    point.longitude <= box.maxLongitude
  );
}
