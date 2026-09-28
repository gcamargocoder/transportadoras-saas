// BI 2 -- estrutura da Central de Inteligencia (/dashboard).

export const INTELLIGENCE_TABS = [
  'overview',
  'operation',
  'financial',
  'fleet',
  'costs',
  'fuel',
  'deadlines',
  'comparatives',
  'occurrences',
  'reports',
  'alerts',
] as const;
export type IntelligenceTab = (typeof INTELLIGENCE_TABS)[number];

export const DEFAULT_INTELLIGENCE_TAB: IntelligenceTab = 'overview';

export function isIntelligenceTab(value: string | null | undefined): value is IntelligenceTab {
  return value !== null && value !== undefined && (INTELLIGENCE_TABS as readonly string[]).includes(value);
}

export interface DetailedScreen {
  label: string;
  href: string;
}

export interface IntelligenceTabConfig {
  value: IntelligenceTab;
  label: string;
  /** Abas ainda sem conteudo: fase do roadmap e telas detalhadas ja existentes. */
  upcoming?: { phase: string; summary: string; screens: DetailedScreen[] };
}

export const INTELLIGENCE_TAB_CONFIG: IntelligenceTabConfig[] = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'operation', label: 'Operação' },
  { value: 'financial', label: 'Financeiro' },
  { value: 'fleet', label: 'Frota' },
  { value: 'costs', label: 'Custos' },
  // Fase 8 -- renomeada de "Tanques" para "Combustível": a aba deixou de
  // ser so o ledger do tanque fisico (Fase 6) e passou a reunir todo o
  // ciclo (estoque, compra, consumo, custo, interno x externo, controle).
  // O rotulo "Combustível" tambem aparece como categoria de custo na aba
  // Custos (fuel_cost/FuelSupply) -- mesma palavra, escopos diferentes,
  // nunca ambiguo para o usuario (abas x categoria dentro de um card).
  { value: 'fuel', label: 'Combustível' },
  { value: 'deadlines', label: 'Prazos' },
  { value: 'comparatives', label: 'Comparativos' },
  { value: 'occurrences', label: 'Ocorrências' },
  { value: 'reports', label: 'Relatórios' },
  { value: 'alerts', label: 'Alertas' },
];

// Drill-down: KPI -> tela de analise detalhada JA existente. KPIs sem tela
// correspondente simplesmente nao recebem link.
export const KPI_DRILL_DOWN: Record<string, DetailedScreen> = {
  trips_completed: { label: 'Ver viagens', href: '/trips' },
  deliveries_completed: { label: 'Ver entregas', href: '/operations/deliveries' },
  on_time_delivery_rate: { label: 'Ver entregas', href: '/operations/deliveries' },
  revenue: { label: 'Ver financeiro', href: '/operations/fleet/financial' },
  operating_result: { label: 'Ver financeiro', href: '/operations/fleet/financial' },
  operating_margin: { label: 'Ver financeiro', href: '/operations/fleet/financial' },
  revenue_per_km: { label: 'Ver financeiro', href: '/operations/fleet/financial' },
  operating_cost: { label: 'Ver custos', href: '/operations/fleet/costs' },
  cost_per_km: { label: 'Ver custos', href: '/operations/fleet/costs' },
  distance_km: { label: 'Ver custos', href: '/operations/fleet/costs' },
  fuel_cost: { label: 'Ver abastecimento', href: '/operations/fleet/fuel' },
  fuel_liters: { label: 'Ver abastecimento', href: '/operations/fleet/fuel' },
  toll_cost: { label: 'Ver pedágios', href: '/operations/fleet/tolls' },
  maintenance_cost: { label: 'Ver manutenção', href: '/operations/fleet/maintenance' },
  tire_cost: { label: 'Ver pneus', href: '/operations/fleet/tires' },
  other_cost: { label: 'Ver custos', href: '/operations/fleet/costs' },
  occurrences_total: { label: 'Ver ocorrências', href: '/operations/fleet/occurrences' },
  occurrences_critical: { label: 'Ver ocorrências', href: '/operations/fleet/occurrences' },
  idle_hours: { label: 'Ver torre de controle', href: '/operations/control-tower' },
  fleet_utilization: { label: 'Ver frota', href: '/operations/fleet' },
  fleet_availability: { label: 'Ver frota', href: '/operations/fleet' },
  // Fase 6 -- ledger do tanque proprio, distinto de fuel_cost/fuel_liters
  // (FuelSupply, consumo do veiculo) acima.
  fuel_tank_stock: { label: 'Ver tanques', href: '/fuel-tanks' },
  fuel_received_liters: { label: 'Ver tanques', href: '/fuel-tanks' },
  fuel_internal_liters: { label: 'Ver tanques', href: '/fuel-tanks' },
  fuel_adjustment_liters: { label: 'Ver tanques', href: '/fuel-tanks' },
  fuel_received_cost: { label: 'Ver tanques', href: '/fuel-tanks' },
  fuel_average_purchase_price: { label: 'Ver tanques', href: '/fuel-tanks' },
  fuel_movements_count: { label: 'Ver tanques', href: '/fuel-tanks' },
  fuel_reconciliation_divergence_liters: { label: 'Ver tanques', href: '/fuel-tanks' },
};
