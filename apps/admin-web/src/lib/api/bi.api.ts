import type { QueryableParams } from '../../types/api';
import type {
  BiAlertsResponseEntity,
  KpiBreakdownEntity,
  KpiCatalogEntity,
  KpiComparisonMode,
  KpiEvidencePageEntity,
  KpiEvidenceSource,
  KpiGranularity,
  KpiSeriesResponseEntity,
  KpiSummaryEntity,
} from '../../types/entities';
import { api } from './http';

// BI 1 -- cliente da camada oficial de KPIs (GET /bi/kpis*). Consumido
// pelas proximas fases do BI (Dashboard operacional/financeiro...); o
// dashboard executivo atual (/dashboard) segue inalterado.
export interface BiKpiScopeQuery extends QueryableParams {
  startDate: string;
  endDate: string;
  vehicleId?: string | undefined;
  fleetId?: string | undefined;
  /** So a receita suporta o recorte por cliente; os demais KPIs voltam UNAVAILABLE. */
  customerId?: string | undefined;
  /** Fase 6 -- so os KPIs do ledger de tanque (fuel_*) suportam; os demais voltam UNAVAILABLE. */
  tankId?: string | undefined;
}

export interface BiKpiSummaryQuery extends BiKpiScopeQuery {
  comparison?: KpiComparisonMode | undefined;
  compareStartDate?: string | undefined;
  compareEndDate?: string | undefined;
  /** Ids separados por virgula (ex: "revenue,cost_per_km"). Omitido = todos. */
  kpis?: string | undefined;
}

export interface BiKpiEvidenceQuery extends BiKpiScopeQuery {
  source: KpiEvidenceSource;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export function getKpiCatalog(signal?: AbortSignal) {
  return api.get<KpiCatalogEntity>('/bi/kpis', {}, signal);
}

export function getKpiSummary(query: BiKpiSummaryQuery, signal?: AbortSignal) {
  return api.get<KpiSummaryEntity>('/bi/kpis/summary', query, signal);
}

export function getKpiEvidence(kpiId: string, query: BiKpiEvidenceQuery, signal?: AbortSignal) {
  return api.get<KpiEvidencePageEntity>(`/bi/kpis/${encodeURIComponent(kpiId)}/evidence`, query, signal);
}

// BI 3 -- serie temporal: varios KPIs no MESMO request (compartilham os
// snapshots de cada balde no servidor).
export interface BiKpiSeriesQuery extends BiKpiScopeQuery {
  /** Ids separados por virgula. */
  kpis: string;
  granularity?: KpiGranularity | undefined;
  comparison?: 'PREVIOUS_PERIOD' | 'PREVIOUS_YEAR' | 'NONE' | undefined;
}

export interface BiKpiBreakdownQuery extends BiKpiScopeQuery {
  kpiId: string;
  dimension: 'customer' | 'vehicle' | 'type' | 'severity' | 'tank';
  limit?: number | undefined;
}

export function getKpiSeries(query: BiKpiSeriesQuery, signal?: AbortSignal) {
  return api.get<KpiSeriesResponseEntity>('/bi/kpis/series', query, signal);
}

export function getKpiBreakdown(query: BiKpiBreakdownQuery, signal?: AbortSignal) {
  return api.get<KpiBreakdownEntity>('/bi/kpis/breakdown', query, signal);
}

// BI 10 -- alertas deterministicos; mesmo escopo/periodo/comparacao do
// summary (nenhum algoritmo de comparacao novo).
export interface BiAlertsQuery extends BiKpiScopeQuery {
  comparison?: KpiComparisonMode | undefined;
  compareStartDate?: string | undefined;
  compareEndDate?: string | undefined;
  /** Severidades separadas por virgula (ex: "WARNING,CRITICAL"). Omitido = todas. */
  severity?: string | undefined;
}

export function getAlerts(query: BiAlertsQuery, signal?: AbortSignal) {
  return api.get<BiAlertsResponseEntity>('/bi/alerts', query, signal);
}
