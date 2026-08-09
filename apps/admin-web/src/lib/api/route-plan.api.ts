// Fase 26 -- roteirizacao geografica. Endpoints administrativos, todos
// aninhados em /trips/:tripId/route-plan (ver apps/api/src/routing).
import type {
  RoutePlanComparisonEntity,
  RoutePlanEntity,
  RoutePlanTollEntity,
} from '../../types/entities';
import { api } from './http';

export function getRoutePlan(tripId: string) {
  return api.get<RoutePlanEntity | null>(`/trips/${tripId}/route-plan`);
}

export function getRoutePlanTolls(tripId: string) {
  return api.get<RoutePlanTollEntity[]>(`/trips/${tripId}/route-plan/tolls`);
}

export function computeRoutePlan(tripId: string) {
  return api.post<RoutePlanEntity>(`/trips/${tripId}/route-plan`);
}

export function computeRoutePlanAlternatives(tripId: string) {
  return api.post<RoutePlanEntity[]>(`/trips/${tripId}/route-plan/alternatives`);
}

export function selectRoutePlan(tripId: string, routePlanId: string) {
  return api.post<RoutePlanEntity>(`/trips/${tripId}/route-plan/select`, { routePlanId });
}

export function recalculateRoutePlan(tripId: string) {
  return api.post<RoutePlanComparisonEntity>(`/trips/${tripId}/route-plan/recalculate`);
}
