// Mesma formula de Haversine usada no backend (apps/api/src/common/utils/geo.util.ts)
// -- duplicada aqui de proposito: driver-app e api sao processos/runtimes
// independentes (Expo/RN vs Node), sem pacote compartilhado de logica de
// negocio neste monorepo.
const EARTH_RADIUS_METERS = 6_371_000;

export function haversineDistanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const deltaLat = toRad(b.latitude - a.latitude);
  const deltaLon = toRad(b.longitude - a.longitude);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METERS * c;
}
