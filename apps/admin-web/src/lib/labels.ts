// Traducoes pt-BR para os enums do backend, usadas em toda a UI (badges,
// selects de filtro, formularios). Mantido centralizado para nao duplicar
// strings por tela.
import {
  AlertSeverity,
  AlertType,
  AxleEventSource,
  BillingPeriodicity,
  DocumentType,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
  FiscalDocumentSource,
  FiscalDocumentStatus,
  FiscalDocumentType,
  FiscalIssueCode,
  FleetType,
  FuelType,
  ImportJobStatus,
  LocationType,
  MaintenanceComponent,
  PaymentType,
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
  TripLoadStatus,
  TripPriority,
  TripStatus,
  TripStopSource,
  TripStopStatus,
  TripStopType,
  UserRole,
  VehicleFuelType,
  VehicleMaintenancePriority,
  VehicleMaintenanceStatus,
  VehicleMaintenanceType,
  VehicleStatus,
  VehicleType,
} from '../types/enums';
import type { DowntimeCategory } from '../types/entities';

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

// Fase 29 -- Alert passa a ter leitura no painel de monitoramento.
export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  ROUTE_DEVIATION: 'Desvio de rota',
  TOLL_DISCREPANCY: 'Divergência de pedágio',
  DELAY: 'Atraso',
  ROUTE_EVENT: 'Evento de rota',
  DOCUMENT_EXPIRING: 'Documento vencendo',
  OTHER: 'Outro',
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
  MAINTENANCE: 'Em manutenção',
  SOLD: 'Vendido',
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
  IN_PROGRESS: 'Em andamento',
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

export const SUBSCRIPTION_PAYMENT_STATUS_TONE: Record<SubscriptionPaymentStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PENDING: 'info',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
};
