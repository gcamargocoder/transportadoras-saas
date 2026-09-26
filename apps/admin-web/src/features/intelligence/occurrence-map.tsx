'use client';

import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { TRIP_OCCURRENCE_SEVERITY_LABELS } from '../../lib/labels';
import type { TripOccurrenceSeverity } from '../../types/enums';

export interface OccurrenceMapPoint {
  id: string;
  latitude: number;
  longitude: number;
  severity: string;
  description: string | null;
  locationLabel: string | null;
  vehicleId: string | null;
  tripId: string | null;
}

interface Cluster {
  key: string;
  latitude: number;
  longitude: number;
  points: OccurrenceMapPoint[];
}

// Agrupamento por grade fixa (~1km, sem lib de clustering externa): o
// volume de pontos ja e limitado pela paginacao das evidencias oficiais
// (BI 8). Nunca interpola/estima coordenadas -- so agrupa pontos REAIS
// que caem na mesma celula.
const GRID_PRECISION = 2;

export function clusterOccurrencePoints(points: OccurrenceMapPoint[]): Cluster[] {
  const byCell = new Map<string, Cluster>();
  for (const point of points) {
    const key = `${point.latitude.toFixed(GRID_PRECISION)}:${point.longitude.toFixed(GRID_PRECISION)}`;
    const cluster = byCell.get(key);
    if (cluster) cluster.points.push(point);
    else byCell.set(key, { key, latitude: point.latitude, longitude: point.longitude, points: [point] });
  }
  return [...byCell.values()];
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 3, HIGH: 3, WARNING: 2, MEDIUM: 2, INFO: 1, LOW: 1 };
const RANK_COLOR: Record<number, string> = { 3: '#dc2626', 2: '#f59e0b', 1: '#3b82f6' };

function worstSeverity(points: OccurrenceMapPoint[]): string {
  let worst = points[0]!.severity;
  let worstRank = SEVERITY_RANK[worst] ?? 0;
  for (const point of points) {
    const rank = SEVERITY_RANK[point.severity] ?? 0;
    if (rank > worstRank) {
      worst = point.severity;
      worstRank = rank;
    }
  }
  return worst;
}

const BRAZIL_CENTER: [number, number] = [-14.235, -51.9253];

// BI 8 -- mapa real: MESMAS coordenadas gravadas em TripOccurrence pelo
// Driver App no momento da ocorrencia (latitude/longitude, evidencia
// TRIP_OCCURRENCE). Nao usar em SSR (acessa window) -- importado via
// next/dynamic com ssr:false em occurrences-tab.tsx.
export function OccurrenceMap({ points }: { points: OccurrenceMapPoint[] }): JSX.Element {
  const clusters = clusterOccurrencePoints(points);
  const center: [number, number] =
    clusters.length > 0
      ? [clusters.reduce((sum, c) => sum + c.latitude, 0) / clusters.length, clusters.reduce((sum, c) => sum + c.longitude, 0) / clusters.length]
      : BRAZIL_CENTER;

  return (
    <MapContainer center={center} zoom={clusters.length > 0 ? 6 : 4} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {clusters.map((cluster) => {
        const severity = worstSeverity(cluster.points) as TripOccurrenceSeverity;
        const color = RANK_COLOR[SEVERITY_RANK[severity] ?? 1];
        return (
          <CircleMarker
            key={cluster.key}
            center={[cluster.latitude, cluster.longitude]}
            radius={Math.min(8 + cluster.points.length * 2, 24)}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.7, weight: 2 }}
          >
            <Popup>
              <div className="flex flex-col gap-1.5 text-xs">
                <p className="font-semibold text-ink">
                  {cluster.points.length} ocorrência{cluster.points.length > 1 ? 's' : ''} {cluster.points[0]?.locationLabel ? `— ${cluster.points[0].locationLabel}` : ''}
                </p>
                <ul className="flex flex-col gap-1">
                  {cluster.points.slice(0, 6).map((point) => (
                    <li key={point.id} className="flex items-center justify-between gap-2">
                      <span>{TRIP_OCCURRENCE_SEVERITY_LABELS[point.severity as TripOccurrenceSeverity] ?? point.severity}</span>
                      {point.tripId && (
                        <a href={`/trips/${point.tripId}`} className="font-medium text-brand-700 underline">
                          Ver viagem
                        </a>
                      )}
                    </li>
                  ))}
                  {cluster.points.length > 6 && <li className="text-ink-subtle">+{cluster.points.length - 6} nesta região</li>}
                </ul>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
