// Traducoes pt-BR para os enums do backend, usadas em toda a UI (badges,
// selects de filtro, formularios). Mantido centralizado para nao duplicar
// strings por tela.
import {
  AlertSeverity,
  AlertType,
  AxleEventSource,
  BillingPeriodicity,
  ContractRenewalStatus,
  ContractStatus,
  DeliveryProofStatus,
  DocumentType,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
  FinancialAccountType,
  FinancialBankTransactionStatus,
  FinancialPeriodStatus,
  FinancialTransactionType,
  FiscalDocumentSource,
  FiscalDocumentStatus,
  FiscalDocumentType,
  FiscalIssueCode,
  TripBillingStatus,
  TripDocumentComplianceStatus,
  DriverStatus,
  DriverType,
  FleetType,
  FreightRuleStatus,
  FreightTableStatus,
  FuelType,
  ImportJobStatus,
  LocationType,
  MaintenanceComponent,
  MaintenanceProviderType,
  PartStockMovementType,
  PayableStatus,
  PaymentType,
  ProposalStatus,
  QuotationAmountSource,
  QuotationStatus,
  ReceivablePaymentMethod,
  ReceivableStatus,
  RevenueCategory,
  RouteTollEstimateSource,
  SettlementStatus,
  SubscriptionPaymentMethod,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
  SyncStatus,
  TenantModule,
  TenantPlanTier,
  TenantStatus,
  TireLocationType,
  TireStatus,
  TollMatchStatus,
  TollTransactionStatus,
  TrailerType,
  TripDeliveryStopStatus,
  TripLoadStatus,
  TripPriority,
  TripStatus,
  TripStopSource,
  TripStopStatus,
  TripStopType,
  TripOccurrenceType,
  TripOccurrenceSeverity,
  TripOccurrenceStatus,
  DriverShiftStatus,
  TripTimelineOrigin,
  NotificationType,
  UserRole,
  VehicleFuelType,
  VehicleMaintenancePriority,
  VehicleMaintenanceStatus,
  VehicleMaintenanceType,
  VehicleStatus,
  VehicleType,
  VehicleOwnershipType,
  VehicleAvailability,
  FleetAvailabilityStatus,
  DocumentExpiryStatus,
  FleetAlertSeverity,
} from '../types/enums';
import type {
  ContractExpiryStatus,
  DowntimeCategory,
  EmptyTripReason,
  FiscalDocumentOrigin,
  ReconciliationEntityType,
  ReconciliationIssueType,
  ReconciliationSeverity,
} from '../types/entities';

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  OPERATOR: 'Operador',
  DISPATCHER: 'Despachante',
  AUDITOR: 'Auditor',
  DRIVER: 'Motorista',
};

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PLANNED: 'Planejada',
  WAITING_DRIVER: 'Aguardando motorista',
  WAITING_DEPARTURE: 'Aguardando saída',
  IN_PROGRESS: 'Em andamento',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const TRIP_LOAD_STATUS_LABELS: Record<TripLoadStatus, string> = {
  LOADED: 'Carregado',
  EMPTY: 'Vazio',
};

// Fase 92 -- motivo/classificacao da viagem vazia (ver docs/trip-empty-runs.md).
export const EMPTY_TRIP_REASON_LABELS: Record<EmptyTripReason, string> = {
  NO_DELIVERIES_PLANNED: 'Sem entregas planejadas',
  ALL_DELIVERIES_CANCELLED: 'Entregas canceladas',
  DELIVERIES_INCOMPLETE: 'Entregas incompletas',
  COMPLETED_DELIVERIES_INCONSISTENT: 'Dado inconsistente (revisar)',
};

// Fase 29 -- Alert passa a ter leitura no painel de monitoramento.
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  ROUTE_DEVIATION: 'Desvio de rota',
  TOLL_DISCREPANCY: 'Divergência de pedágio',
  DELAY: 'Atraso',
  ROUTE_EVENT: 'Evento de rota',
  DOCUMENT_EXPIRING: 'Documento vencendo',
  OTHER: 'Outro',
};

export const ALERT_SEVERITY_TONE: Record<AlertSeverity, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export const TRIP_STOP_TYPE_LABELS: Record<TripStopType, string> = {
  UNKNOWN: 'Não classificada',
  FUEL: 'Abastecimento',
  REST: 'Descanso',
  MEAL: 'Refeição',
  MAINTENANCE: 'Manutenção',
  OTHER: 'Outro',
  LOADING: 'Carga',
  UNLOADING: 'Descarga',
  WAITING_LOADING: 'Aguardando carga',
  WAITING_UNLOADING: 'Aguardando descarga',
  YARD: 'Pátio',
  CUSTOMER: 'Cliente',
  GARAGE: 'Garagem',
  BREAKDOWN: 'Quebra',
  TIRE: 'Pneu',
  CONGESTION: 'Congestionamento',
  ACCIDENT: 'Acidente',
  ROAD_CLOSURE: 'Interdição',
  INSPECTION: 'Fiscalização',
  PERSONAL_NEED: 'Necessidade pessoal',
  DOCUMENTATION: 'Documentação',
  WAITING_AUTHORIZATION: 'Aguardando autorização',
};

export const TRIP_STOP_STATUS_LABELS: Record<TripStopStatus, string> = {
  OPEN: 'Em aberto',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const TRIP_STOP_SOURCE_LABELS: Record<TripStopSource, string> = {
  MANUAL: 'Manual',
  DRIVER_APP: 'App do motorista',
  GPS: 'GPS',
  SYSTEM: 'Sistema',
  IMPORT: 'Importação',
  ADMIN: 'Administrativo',
};

export const AXLE_EVENT_SOURCE_LABELS: Record<AxleEventSource, string> = {
  DRIVER_INPUT: 'Informado pelo motorista',
  TIMEOUT_DEFAULT: 'Padrão (sem resposta)',
};

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  PENDING: 'Pendente',
  SYNCED: 'Sincronizado',
  FAILED: 'Falha',
};

export const ROUTE_TOLL_ESTIMATE_SOURCE_LABELS: Record<RouteTollEstimateSource, string> = {
  MATCHED_PLAZAS: 'Praças identificadas',
  PROVIDER_AGGREGATE: 'Estimativa do provedor',
  NONE: 'Sem estimativa',
};

export const TOLL_MATCH_STATUS_LABELS: Record<TollMatchStatus, string> = {
  MATCHED: 'Identificada',
  UNMATCHED: 'Não identificada',
};

export const TRIP_PRIORITY_LABELS: Record<TripPriority, string> = {
  LOW: 'Baixa',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const TOLL_STATUS_LABELS: Record<TollTransactionStatus, string> = {
  NORMAL: 'Normal',
  DIVERGENT: 'Divergente',
  EXEMPT: 'Isento',
};

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  SUSPENDED: 'Suspenso',
  MAINTENANCE: 'Em manutenção',
  SOLD: 'Vendido',
};

// Fase 62 -- Gestao Avancada de Veiculos e Frota.
export const VEHICLE_OWNERSHIP_TYPE_LABELS: Record<VehicleOwnershipType, string> = {
  OWN: 'Próprio',
  AGGREGATED: 'Agregado',
  THIRD_PARTY: 'Terceiro',
};

export const VEHICLE_OWNERSHIP_TYPE_TONE: Record<VehicleOwnershipType, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'> = {
  OWN: 'brand',
  AGGREGATED: 'info',
  THIRD_PARTY: 'neutral',
};

export const VEHICLE_AVAILABILITY_LABELS: Record<VehicleAvailability, string> = {
  AVAILABLE: 'Disponível',
  ON_TRIP: 'Em viagem',
  UNAVAILABLE: 'Indisponível',
};

export const VEHICLE_AVAILABILITY_TONE: Record<VehicleAvailability, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  AVAILABLE: 'success',
  ON_TRIP: 'info',
  UNAVAILABLE: 'neutral',
};

// Fase 86 -- visao operacional detalhada (5 categorias), distinta de
// VEHICLE_AVAILABILITY_LABELS/TONE acima (3 categorias, nunca alterada).
export const FLEET_AVAILABILITY_STATUS_LABELS: Record<FleetAvailabilityStatus, string> = {
  AVAILABLE: 'Disponível',
  ON_TRIP: 'Em viagem',
  MAINTENANCE: 'Em manutenção',
  INACTIVE: 'Inativo',
  UNAVAILABLE: 'Indisponível',
};

export const FLEET_AVAILABILITY_STATUS_TONE: Record<FleetAvailabilityStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  AVAILABLE: 'success',
  ON_TRIP: 'info',
  MAINTENANCE: 'warning',
  INACTIVE: 'neutral',
  UNAVAILABLE: 'danger',
};

export const DOCUMENT_EXPIRY_STATUS_LABELS: Record<DocumentExpiryStatus, string> = {
  VALID: 'Válido',
  EXPIRING_SOON: 'Vencendo em breve',
  EXPIRED: 'Vencido',
  NO_EXPIRY: 'Sem vencimento',
};

export const DOCUMENT_EXPIRY_STATUS_TONE: Record<DocumentExpiryStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  VALID: 'success',
  EXPIRING_SOON: 'warning',
  EXPIRED: 'danger',
  NO_EXPIRY: 'neutral',
};

export const FLEET_ALERT_SEVERITY_TONE: Record<FleetAlertSeverity, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  INFO: 'info',
  ATTENTION: 'warning',
  CRITICAL: 'danger',
};

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  TRACTOR_UNIT: 'Cavalo mecânico',
  TRUCK: 'Caminhão',
  VAN: 'Van',
  PICKUP: 'Pickup',
  OTHER: 'Outro',
};

export const VEHICLE_FUEL_TYPE_LABELS: Record<VehicleFuelType, string> = {
  DIESEL: 'Diesel',
  DIESEL_S10: 'Diesel S10',
  GASOLINE: 'Gasolina',
  ETHANOL: 'Etanol',
  FLEX: 'Flex',
  ELECTRIC: 'Elétrico',
  HYBRID: 'Híbrido',
  GNV: 'GNV',
  OTHER: 'Outro',
};

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  DIESEL_S10: 'Diesel S10',
  DIESEL_S500: 'Diesel S500',
  GASOLINA: 'Gasolina',
  ETANOL: 'Etanol',
  ARLA32: 'Arla 32',
  OUTRO: 'Outro',
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CARD: 'Cartão',
  INVOICE: 'Fatura',
  FLEET_CARD: 'Cartão frota',
  OTHER: 'Outro',
};

export const MAINTENANCE_STATUS_LABELS: Record<VehicleMaintenanceStatus, string> = {
  OPEN: 'Aberta',
  DIAGNOSING: 'Em diagnóstico',
  AWAITING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovada',
  IN_PROGRESS: 'Em execução',
  WAITING_PARTS: 'Aguardando peças',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const MAINTENANCE_TYPE_LABELS: Record<VehicleMaintenanceType, string> = {
  PREVENTIVE: 'Preventiva',
  CORRECTIVE: 'Corretiva',
  INSPECTION: 'Inspeção',
  EMERGENCY: 'Emergencial',
  OTHER: 'Outra',
};

export const MAINTENANCE_PRIORITY_LABELS: Record<VehicleMaintenancePriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export const MAINTENANCE_COMPONENT_LABELS: Record<MaintenanceComponent, string> = {
  ENGINE: 'Motor',
  TRANSMISSION: 'Câmbio',
  DIFFERENTIAL: 'Diferencial',
  BRAKES: 'Freio',
  SUSPENSION: 'Suspensão',
  CLUTCH: 'Embreagem',
  TIRES: 'Pneus',
  COOLING: 'Arrefecimento',
  ELECTRICAL: 'Elétrica',
  ARLA: 'Arla',
  FILTERS: 'Filtros',
  ENGINE_OIL: 'Óleo Motor',
  TRANSMISSION_OIL: 'Óleo Câmbio',
  DIFFERENTIAL_OIL: 'Óleo Diferencial',
  DIESEL_FILTER: 'Filtro Diesel',
  AIR_FILTER: 'Filtro Ar',
  OIL_FILTER: 'Filtro Óleo',
  BATTERY: 'Bateria',
  SPRINGS: 'Molas',
  SHOCK_ABSORBERS: 'Amortecedores',
  SIDER: 'Sider',
  TRAILER: 'Carreta',
  OTHER: 'Outro',
};

// Fase 84 -- oficina/fornecedor de manutencao.
export const MAINTENANCE_PROVIDER_TYPE_LABELS: Record<MaintenanceProviderType, string> = {
  WORKSHOP: 'Oficina',
  SUPPLIER: 'Fornecedor',
};

// Fase 83 -- ledger de estoque de pecas.
export const PART_STOCK_MOVEMENT_TYPE_LABELS: Record<PartStockMovementType, string> = {
  IN: 'Entrada',
  OUT: 'Saída',
  ADJUSTMENT: 'Ajuste',
};

export const TIRE_STATUS_LABELS: Record<TireStatus, string> = {
  NEW: 'Novo',
  IN_USE: 'Em uso',
  STOCK: 'Estoque',
  RETREADED: 'Recapado',
  SCRAPPED: 'Sucateado',
};

export const TIRE_LOCATION_LABELS: Record<TireLocationType, string> = {
  STOCK: 'Estoque',
  VEHICLE: 'Veículo',
  TRAILER: 'Carreta',
};

// Categoria de tempo parado (dashboard "Tempo parado e receita perdida")
// -- mapeada de TripStopType no backend (MAINTENANCE/BREAKDOWN/FUEL; todo
// o resto cai em "Outras").
export const DOWNTIME_CATEGORY_LABELS: Record<DowntimeCategory, string> = {
  MAINTENANCE: 'Manutenção',
  BREAKDOWN: 'Quebra',
  FUEL: 'Abastecimento',
  OTHER: 'Outras',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  FUEL: 'Combustível',
  FOOD: 'Alimentação',
  HOTEL: 'Hospedagem',
  TOLL_EXTRA: 'Pedágio (avulso)',
  MAINTENANCE: 'Manutenção',
  TIRES: 'Pneus',
  PARKING: 'Estacionamento',
  WASH: 'Lavagem',
  ADVANCE: 'Adiantamento',
  FINE: 'Multa',
  OTHER: 'Outra',
};

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  CASH: 'Dinheiro',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  PIX: 'Pix',
  BANK_TRANSFER: 'Transferência bancária',
  COMPANY_ACCOUNT: 'Conta da empresa',
  OTHER: 'Outro',
};

export const REVENUE_CATEGORY_LABELS: Record<RevenueCategory, string> = {
  FREIGHT: 'Frete',
  BONUS: 'Bônus',
  EXTRA_SERVICE: 'Serviço extra',
  INSURANCE: 'Seguro',
  OTHER: 'Outra',
};

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  OPEN: 'Em aberto',
  CLOSED: 'Fechado',
  REOPENED: 'Reaberto',
};

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  FACTORY: 'Fábrica',
  DISTRIBUTION_CENTER: 'Centro de distribuição',
  PORT: 'Porto',
  TERMINAL: 'Terminal',
  CUSTOMER_SITE: 'Cliente',
  BRANCH: 'Filial',
  OTHER: 'Outro',
};

export const TRAILER_TYPE_LABELS: Record<TrailerType, string> = {
  SIMPLE: 'Simples',
  BITREM: 'Bitrem',
  RODOTREM: 'Rodotrem',
  VANDERLEIA: 'Vanderléia',
  FULL_TRAILER: 'Reboque completo',
  SEMI_TRAILER: 'Semirreboque',
  DOLLY: 'Dolly',
  OTHER: 'Outro',
};

export const FLEET_TYPE_LABELS: Record<FleetType, string> = {
  OWN: 'Própria',
  AGGREGATED: 'Agregada',
  OUTSOURCED: 'Terceirizada',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CRLV: 'CRLV',
  ANTT: 'ANTT',
  CNH: 'CNH',
  MEDICAL_EXAM: 'Exame médico',
  MOPP: 'MOPP',
  LICENSING: 'Licenciamento',
  INSURANCE: 'Seguro',
  OTHER: 'Outro',
};

export const IMPORT_JOB_STATUS_LABELS: Record<ImportJobStatus, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
  PARTIAL_SUCCESS: 'Sucesso parcial',
};

export function labelOrValue<T extends string>(map: Record<T, string>, value: T): string {
  return map[value] ?? value;
}

// Fase 47 -- Super Administracao da Plataforma.
export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  ACTIVE: 'Ativa',
  TRIAL: 'Em trial',
  SUSPENDED: 'Suspensa',
  EXPIRED: 'Expirada',
};

export const TENANT_STATUS_TONE: Record<TenantStatus, 'success' | 'warning' | 'danger' | 'info'> = {
  ACTIVE: 'success',
  TRIAL: 'info',
  SUSPENDED: 'danger',
  EXPIRED: 'warning',
};

export const TENANT_PLAN_TIER_LABELS: Record<TenantPlanTier, string> = {
  FREE: 'Gratuito',
  STARTER: 'Starter',
  PROFESSIONAL: 'Profissional',
  ENTERPRISE: 'Enterprise',
};

export const TENANT_MODULE_LABELS: Record<TenantModule, string> = {
  TRIPS: 'Viagens',
  TOLLS: 'Pedágios',
  FUEL: 'Abastecimento',
  MAINTENANCE: 'Manutenção',
  TIRES: 'Pneus',
  CHECKLIST: 'Checklist',
  STOPS: 'Paradas',
  DASHBOARDS: 'Dashboards',
  REPORTS: 'Relatórios',
  FREIGHT: 'Fretes e faturamento',
};

// Fase 50 -- Gestao Manual de Assinaturas e Cobranca.
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Ativa',
  PENDING: 'Pendente',
  OVERDUE: 'Atrasada',
  SUSPENDED: 'Suspensa',
  CANCELLED: 'Cancelada',
};

export const SUBSCRIPTION_STATUS_TONE: Record<SubscriptionStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  ACTIVE: 'success',
  PENDING: 'info',
  OVERDUE: 'danger',
  SUSPENDED: 'warning',
  CANCELLED: 'neutral',
};

export const SUBSCRIPTION_PAYMENT_METHOD_LABELS: Record<SubscriptionPaymentMethod, string> = {
  PIX_SCHEDULED: 'PIX agendado',
  DIRECT_DEBIT: 'Débito automático',
  STRIPE: 'Stripe',
};

export const BILLING_PERIODICITY_LABELS: Record<BillingPeriodicity, string> = {
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
};

export const SUBSCRIPTION_PAYMENT_STATUS_LABELS: Record<SubscriptionPaymentStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  OVERDUE: 'Atrasado',
  CANCELLED: 'Cancelado',
};

export const FISCAL_DOCUMENT_TYPE_LABELS: Record<FiscalDocumentType, string> = {
  CTE: 'CT-e',
  MDFE: 'MDF-e',
  NFE: 'NF-e',
  CIOT: 'CIOT',
  DACTE: 'DACTE',
  DAMDFE: 'DAMDFE',
  DELIVERY_PROOF: 'Comprovante de entrega',
  OTHER: 'Outro',
  // Fase 102 -- evidencia documental de uma ocorrencia.
  OCCURRENCE_EVIDENCE: 'Evidência de ocorrência',
};

// VALID significa apenas "estrutura/conteudo basico reconhecido pelo
// sistema" -- NUNCA validacao fiscal oficial perante a SEFAZ.
export const FISCAL_DOCUMENT_STATUS_LABELS: Record<FiscalDocumentStatus, string> = {
  PENDING: 'Pendente',
  VALID: 'Reconhecido',
  INVALID: 'Inválido',
  CANCELLED: 'Cancelado',
};

export const FISCAL_DOCUMENT_STATUS_TONE: Record<FiscalDocumentStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PENDING: 'info',
  VALID: 'success',
  INVALID: 'danger',
  CANCELLED: 'neutral',
};

export const FISCAL_DOCUMENT_SOURCE_LABELS: Record<FiscalDocumentSource, string> = {
  UPLOAD: 'Upload manual',
  XML_IMPORT: 'Importação XML',
};

// Fase 54 -- motivos objetivos de inconsistência estrutural (nunca fiscal/
// SEFAZ).
export const FISCAL_ISSUE_CODE_LABELS: Record<FiscalIssueCode, string> = {
  INVALID_ACCESS_KEY: 'Chave de acesso inválida',
  TYPE_MISMATCH: 'Tipo incompatível com a chave de acesso',
  ESSENTIAL_FIELDS_MISSING: 'Campos essenciais ausentes',
  INCONSISTENT_DATE: 'Data de emissão inconsistente',
  DUPLICATE_CANDIDATE: 'Possível documento duplicado',
  INCONSISTENT_LINK: 'Vínculo inconsistente com a viagem',
  NO_TRIP_CONTEXT: 'Sem viagem vinculada',
};

// Fase 55 -- situação documental da viagem. NUNCA "conformidade SEFAZ".
export const TRIP_DOCUMENT_COMPLIANCE_STATUS_LABELS: Record<TripDocumentComplianceStatus, string> = {
  OK: 'Documentação OK',
  ATTENTION: 'Atenção',
  PROBLEMATIC: 'Problemático',
  UNAVAILABLE: 'Indisponível',
};

export const TRIP_DOCUMENT_COMPLIANCE_STATUS_TONE: Record<TripDocumentComplianceStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  OK: 'success',
  ATTENTION: 'warning',
  PROBLEMATIC: 'danger',
  UNAVAILABLE: 'neutral',
};

// Fase 56 -- comprovante de entrega. Evidencia documental operacional,
// NUNCA validacao fiscal SEFAZ.
export const DELIVERY_PROOF_STATUS_LABELS: Record<DeliveryProofStatus, string> = {
  MISSING: 'Sem comprovante',
  PENDING: 'Comprovante pendente',
  AVAILABLE: 'Comprovante disponível',
  PROBLEMATIC: 'Comprovante com problema',
};

export const DELIVERY_PROOF_STATUS_TONE: Record<DeliveryProofStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  MISSING: 'neutral',
  PENDING: 'info',
  AVAILABLE: 'success',
  PROBLEMATIC: 'danger',
};

export const FISCAL_DOCUMENT_ORIGIN_LABELS: Record<FiscalDocumentOrigin, string> = {
  DRIVER: 'App do motorista',
  ADMIN: 'Painel administrativo',
};

export const SUBSCRIPTION_PAYMENT_STATUS_TONE: Record<SubscriptionPaymentStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PENDING: 'info',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
};

// Fase 59 -- Gestao de Fretes, Contratos e Tabelas de Frete.
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  SUSPENDED: 'Suspenso',
  EXPIRED: 'Vencido',
  CANCELLED: 'Cancelado',
};

export const CONTRACT_STATUS_TONE: Record<ContractStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  EXPIRED: 'danger',
  CANCELLED: 'danger',
};

// Fase 98 -- Renovacao de Contratos.
export const CONTRACT_RENEWAL_STATUS_LABELS: Record<ContractRenewalStatus, string> = {
  PENDING: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const CONTRACT_RENEWAL_STATUS_TONE: Record<ContractRenewalStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PENDING: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

export const CONTRACT_EXPIRY_STATUS_LABELS: Record<ContractExpiryStatus, string> = {
  EXPIRING_SOON: 'Vencendo',
  EXPIRED: 'Vencido',
};

export const CONTRACT_EXPIRY_STATUS_TONE: Record<ContractExpiryStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  EXPIRING_SOON: 'warning',
  EXPIRED: 'danger',
};

export const FREIGHT_TABLE_STATUS_LABELS: Record<FreightTableStatus, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
};

export const FREIGHT_TABLE_STATUS_TONE: Record<FreightTableStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  EXPIRED: 'danger',
  CANCELLED: 'danger',
};

export const FREIGHT_RULE_STATUS_LABELS: Record<FreightRuleStatus, string> = {
  ACTIVE: 'Vigente',
  ARCHIVED: 'Substituída',
};

export const FREIGHT_RULE_STATUS_TONE: Record<FreightRuleStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  ACTIVE: 'success',
  ARCHIVED: 'neutral',
};

// Fase 60 -- Faturamento Operacional e Conciliacao Comercial.
export const TRIP_BILLING_STATUS_LABELS: Record<TripBillingStatus, string> = {
  DRAFT: 'Rascunho',
  READY: 'Pronto para faturar',
  PARTIALLY_INVOICED: 'Faturado parcialmente',
  INVOICED: 'Faturado',
  PAID: 'Recebido',
  CANCELLED: 'Cancelado',
};

export const TRIP_BILLING_STATUS_TONE: Record<TripBillingStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  READY: 'info',
  PARTIALLY_INVOICED: 'warning',
  INVOICED: 'success',
  PAID: 'success',
  CANCELLED: 'danger',
};

// Fase 61 -- Motoristas, Agregados e Terceiros.
export const DRIVER_TYPE_LABELS: Record<DriverType, string> = {
  OWN: 'Próprio',
  AGGREGATED: 'Agregado',
  THIRD_PARTY: 'Terceiro',
};

export const DRIVER_TYPE_TONE: Record<DriverType, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'> = {
  OWN: 'brand',
  AGGREGATED: 'info',
  THIRD_PARTY: 'neutral',
};

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  SUSPENDED: 'Suspenso',
};

export const DRIVER_STATUS_TONE: Record<DriverStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  SUSPENDED: 'warning',
};

// Fase 67 -- Timeline Operacional, Ocorrências e Jornada da Viagem.
// Fase 101 -- categorias de ocorrência de ENTREGA (4 novas) + escala
// LOW/MEDIUM/HIGH (convive com INFO/WARNING/CRITICAL) + status IN_PROGRESS.
export const TRIP_OCCURRENCE_TYPE_LABELS: Record<TripOccurrenceType, string> = {
  ACCIDENT: 'Acidente',
  BREAKDOWN: 'Quebra/pane',
  DELAY: 'Atraso',
  ROUTE_DEVIATION: 'Desvio de rota',
  DELIVERY_PROBLEM: 'Problema na entrega',
  DOCUMENT_PROBLEM: 'Problema documental',
  VEHICLE_PROBLEM: 'Problema no veículo',
  FUEL_PROBLEM: 'Problema de combustível',
  TIRE_PROBLEM: 'Problema de pneu',
  OTHER: 'Outro',
  RECIPIENT_ABSENT: 'Destinatário ausente',
  WRONG_ADDRESS: 'Endereço incorreto',
  DELIVERY_REFUSED: 'Recusa',
  CARGO_DAMAGE: 'Avaria',
};

export const TRIP_OCCURRENCE_SEVERITY_LABELS: Record<TripOccurrenceSeverity, string> = {
  INFO: 'Informativa',
  WARNING: 'Atenção',
  CRITICAL: 'Crítica',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
};

export const TRIP_OCCURRENCE_STATUS_LABELS: Record<TripOccurrenceStatus, string> = {
  OPEN: 'Em aberto',
  IN_PROGRESS: 'Em andamento',
  RESOLVED: 'Resolvida',
  CANCELLED: 'Cancelada',
};

export const TRIP_DELIVERY_STOP_STATUS_LABELS: Record<TripDeliveryStopStatus, string> = {
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
  FAILED: 'Com falha',
};

export const DRIVER_SHIFT_STATUS_LABELS: Record<DriverShiftStatus, string> = {
  OPEN: 'Em andamento',
  CLOSED: 'Encerrada',
  CANCELLED: 'Cancelada',
};

export const TRIP_TIMELINE_ORIGIN_LABELS: Record<TripTimelineOrigin, string> = {
  STOP: 'Parada',
  ROUTE_EVENT: 'Evento de rota',
  FUEL: 'Abastecimento',
  TOLL: 'Pedágio',
  AXLE: 'Exceção de eixos',
  CHECKLIST: 'Checklist',
  FISCAL: 'Documento fiscal',
  DELIVERY_PROOF: 'Comprovante de entrega',
  EXPENSE: 'Despesa',
  REVENUE: 'Receita',
  OCCURRENCE: 'Ocorrência',
  AUDIT: 'Auditoria',
};

// Fase 69 -- Centro de Alertas e Notificacoes.
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  CRITICAL_OCCURRENCE: 'Ocorrência crítica',
  VEHICLE_UNAVAILABLE: 'Veículo indisponível',
  VEHICLE_MAINTENANCE: 'Manutenção atrasada',
  TIRE_NEAR_REPLACEMENT: 'Pneu próximo da troca',
  FUEL_ODOMETER_REGRESSION: 'Hodômetro regressivo',
  FISCAL_DOCUMENT_PROBLEM: 'Documento fiscal com problema',
  TRIP_DELAYED: 'Viagem atrasada',
  DRIVER_SUSPENDED: 'Motorista suspenso',
  DRIVER_INACTIVE: 'Motorista inativo',
  BILLING_PENDING: 'Faturamento pendente',
  // Fase 70.
  DELIVERY_PROOF_PENDING: 'Comprovante de entrega aguardando revisão',
  DELIVERY_PROOF_PROBLEM: 'Comprovante de entrega com problema',
};

// Fase 72 -- Contas a Receber. Inclui OVERDUE (nunca persistido no
// backend, sempre calculado ao vivo -- ver receivable-status.util.ts).
export const RECEIVABLE_STATUS_LABELS: Record<ReceivableStatus | 'OVERDUE', string> = {
  OPEN: 'Em aberto',
  PARTIALLY_RECEIVED: 'Recebido parcialmente',
  PAID: 'Recebido',
  OVERDUE: 'Vencido',
  CANCELLED: 'Cancelado',
};

export const RECEIVABLE_STATUS_TONE: Record<ReceivableStatus | 'OVERDUE', 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  OPEN: 'info',
  PARTIALLY_RECEIVED: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
};

export const RECEIVABLE_PAYMENT_METHOD_LABELS: Record<ReceivablePaymentMethod, string> = {
  PIX: 'PIX',
  BANK_TRANSFER: 'Transferência bancária',
  BOLETO: 'Boleto',
  CASH: 'Dinheiro',
  CHECK: 'Cheque',
  CARD: 'Cartão',
  OTHER: 'Outro',
};

// Fase 73 -- Contas a Pagar. Inclui OVERDUE (nunca persistido no backend).
// paymentMethod/category reaproveitam EXPENSE_PAYMENT_METHOD_LABELS/
// EXPENSE_CATEGORY_LABELS ja existentes -- nenhum label paralelo.
export const PAYABLE_STATUS_LABELS: Record<PayableStatus | 'OVERDUE', string> = {
  OPEN: 'Em aberto',
  PARTIALLY_PAID: 'Pago parcialmente',
  PAID: 'Pago',
  OVERDUE: 'Vencido',
  CANCELLED: 'Cancelado',
};

export const PAYABLE_STATUS_TONE: Record<PayableStatus | 'OVERDUE', 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  OPEN: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
};

// Fase 75 -- Conciliacao Financeira. type/severity nao sao enums Prisma
// (nunca persistidos, ver ../types/entities.ts) -- importados a parte.
export const RECONCILIATION_ISSUE_TYPE_LABELS: Record<ReconciliationIssueType, string> = {
  RECEIVABLE_WITHOUT_BILLING: 'Título ativo com faturamento cancelado',
  BILLING_WITHOUT_RECEIVABLE: 'Faturamento concluído sem conta a receber',
  RECEIVABLE_BALANCE_INCONSISTENT: 'Saldo de recebível inconsistente',
  RECEIVABLE_PAYMENT_EXCEEDS_INVOICED: 'Recebido acima do faturado',
  PAYABLE_WITHOUT_APPROVED_EXPENSE: 'Título ativo com despesa não aprovada',
  PAYABLE_BALANCE_INCONSISTENT: 'Saldo de conta a pagar inconsistente',
  PAYABLE_PAYMENT_EXCEEDS_EXPENSE: 'Pago acima da despesa',
  DUPLICATE_RECEIVABLE: 'Conta a receber duplicada',
  DUPLICATE_PAYABLE: 'Conta a pagar duplicada',
  TRIP_EXPENSE_WITHOUT_PAYABLE: 'Despesa aprovada sem conta a pagar',
  TRIP_BILLING_WITHOUT_RECEIVABLE: 'Faturamento em andamento sem conta a receber',
};

export const RECONCILIATION_SEVERITY_LABELS: Record<ReconciliationSeverity, string> = {
  INFO: 'Informativo',
  WARNING: 'Atenção',
  CRITICAL: 'Crítico',
};

export const RECONCILIATION_SEVERITY_TONE: Record<ReconciliationSeverity, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'danger',
};

export const RECONCILIATION_ENTITY_TYPE_LABELS: Record<ReconciliationEntityType, string> = {
  Receivable: 'Conta a receber',
  Payable: 'Conta a pagar',
  TripBilling: 'Faturamento',
  TripExpense: 'Despesa',
};

// Fase 76 -- Fechamento Financeiro/Periodos.
export const FINANCIAL_PERIOD_STATUS_LABELS: Record<FinancialPeriodStatus, string> = {
  OPEN: 'Aberto',
  CLOSED: 'Fechado',
};

export const FINANCIAL_PERIOD_STATUS_TONE: Record<FinancialPeriodStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  OPEN: 'info',
  CLOSED: 'neutral',
};

// Fase 77 -- Auditoria Financeira. entityName/action sao strings livres em
// AuditLog (nunca enums Prisma) -- os labels cobrem exatamente os valores
// ja gravados por ReceivablesService/PayablesService/FinancialPeriodsService
// (Fases 72/73/76), reaproveitados aqui, nunca renomeados.
// Fase 78 -- FinancialAccount/FinancialTransaction/FinancialTransfer
// adicionados ao mesmo mapa (sao os entityName agora aceitos por
// GET /finance/audit, ver FINANCE_AUDIT_ENTITY_NAMES no backend).
export const FINANCE_AUDIT_ENTITY_NAME_LABELS: Record<string, string> = {
  Receivable: 'Conta a receber',
  ReceivablePayment: 'Recebimento',
  Payable: 'Conta a pagar',
  PayablePayment: 'Pagamento',
  FinancialPeriod: 'Período financeiro',
  FinancialAccount: 'Conta financeira',
  FinancialTransaction: 'Movimentação financeira',
  FinancialTransfer: 'Transferência entre contas',
  FinancialBankTransaction: 'Movimentação bancária (extrato)',
};

export const FINANCE_AUDIT_ACTION_LABELS: Record<string, string> = {
  'receivable.created': 'Conta a receber criada',
  'receivable.payment_created': 'Recebimento registrado',
  'receivable.cancelled': 'Conta a receber cancelada',
  'payable.created': 'Conta a pagar criada',
  'payable.payment_created': 'Pagamento registrado',
  'payable.cancelled': 'Conta a pagar cancelada',
  'financial_period.created': 'Período aberto',
  'financial_period.closed': 'Período fechado',
  'financial_account.created': 'Conta financeira criada',
  'financial_account.updated': 'Conta financeira atualizada',
  'financial_account.activated': 'Conta financeira ativada',
  'financial_account.deactivated': 'Conta financeira desativada',
  'financial_transaction.created': 'Movimentação registrada',
  'financial_transfer.created': 'Transferência realizada',
  'financial_bank_transaction.imported': 'Movimentação bancária importada',
  'financial_bank_transaction.reconciled': 'Movimentação bancária conciliada',
  'financial_bank_transaction.unreconciled': 'Movimentação bancária desconciliada',
};

// Fase 78 -- Contas Financeiras.
export const FINANCIAL_ACCOUNT_TYPE_LABELS: Record<FinancialAccountType, string> = {
  BANK: 'Bancária',
  CASH: 'Caixa',
};

export const FINANCIAL_TRANSACTION_TYPE_LABELS: Record<FinancialTransactionType, string> = {
  CREDIT: 'Crédito',
  DEBIT: 'Débito',
};

// Fase 80 -- Conciliação Bancária.
export const FINANCIAL_BANK_TRANSACTION_STATUS_LABELS: Record<FinancialBankTransactionStatus, string> = {
  PENDING: 'Pendente',
  MATCHED: 'Conciliada',
  DIVERGENT: 'Divergente',
};

export const FINANCIAL_BANK_TRANSACTION_STATUS_TONE: Record<FinancialBankTransactionStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PENDING: 'neutral',
  MATCHED: 'success',
  DIVERGENT: 'warning',
};

// Fase 94 -- Cotacoes.
export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviada',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  CONVERTED: 'Convertida em viagem',
  CANCELLED: 'Cancelada',
};

export const QUOTATION_STATUS_TONE: Record<QuotationStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  SENT: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  CONVERTED: 'success',
  CANCELLED: 'danger',
};

export const QUOTATION_AMOUNT_SOURCE_LABELS: Record<QuotationAmountSource, string> = {
  CALCULATED: 'Calculado pelo motor de precificação',
  MANUAL: 'Informado manualmente',
};

// Fase 95 -- Propostas.
export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviada',
  ACCEPTED: 'Aceita',
  REJECTED: 'Recusada',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

export const PROPOSAL_STATUS_TONE: Record<ProposalStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'danger',
  CANCELLED: 'danger',
};

export const MONTH_LABELS: Record<number, string> = {
  1: 'Janeiro',
  2: 'Fevereiro',
  3: 'Março',
  4: 'Abril',
  5: 'Maio',
  6: 'Junho',
  7: 'Julho',
  8: 'Agosto',
  9: 'Setembro',
  10: 'Outubro',
  11: 'Novembro',
  12: 'Dezembro',
};
