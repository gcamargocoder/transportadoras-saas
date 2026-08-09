// Distancia aproximada entre dois pontos GPS (Fase 25) -- usada para
// proximidade de praca de pedagio e deteccao de parada. Formula de Haversine
// pura, sem nenhuma dependencia de mapas/roteirizacao externa: suficiente
// para "esta perto ou nao" numa escala de metros/poucos km, nao para
// distancia real de estrada.
const EARTH_RADIUS_METERS = 6_371_000;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METERS * c;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
