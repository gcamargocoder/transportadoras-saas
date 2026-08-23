// Espelha 1:1 os enums definidos em packages/database/prisma/schema.prisma.
// Nunca inventar valores aqui -- qualquer novo enum/valor precisa existir
// primeiro no schema/back-end.

export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  OPERATOR: 'OPERATOR',
  DISPATCHER: 'DISPATCHER',
  AUDITOR: 'AUDITOR',
  DRIVER: 'DRIVER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const FleetType = {
  OWN: 'OWN',
  AGGREGATED: 'AGGREGATED',
  OUTSOURCED: 'OUTSOURCED',
} as const;
export type FleetType = (typeof FleetType)[keyof typeof FleetType];

export const VehicleType = {
  TRACTOR_UNIT: 'TRACTOR_UNIT',
  TRUCK: 'TRUCK',
  VAN: 'VAN',
  PICKUP: 'PICKUP',
  OTHER: 'OTHER',
} as const;
export type VehicleType = (typeof VehicleType)[keyof typeof VehicleType];

// Fase 62 -- SUSPENDED adicionado (impedimento temporario de operar,
// distinto de MAINTENANCE/INACTIVE).
export const VehicleStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  MAINTENANCE: 'MAINTENANCE',
  SOLD: 'SOLD',
} as const;
export type VehicleStatus = (typeof VehicleStatus)[keyof typeof VehicleStatus];

export const VehicleFuelType = {
  DIESEL: 'DIESEL',
  DIESEL_S10: 'DIESEL_S10',
  GASOLINE: 'GASOLINE',
  ETHANOL: 'ETHANOL',
  FLEX: 'FLEX',
  ELECTRIC: 'ELECTRIC',
  HYBRID: 'HYBRID',
  GNV: 'GNV',
  OTHER: 'OTHER',
} as const;
export type VehicleFuelType = (typeof VehicleFuelType)[keyof typeof VehicleFuelType];

export const FuelType = {
  DIESEL_S10: 'DIESEL_S10',
  DIESEL_S500: 'DIESEL_S500',
  GASOLINA: 'GASOLINA',
  ETANOL: 'ETANOL',
  ARLA32: 'ARLA32',
  OUTRO: 'OUTRO',
} as const;
export type FuelType = (typeof FuelType)[keyof typeof FuelType];

export const PaymentType = {
  CASH: 'CASH',
  PIX: 'PIX',
  CARD: 'CARD',
  INVOICE: 'INVOICE',
  FLEET_CARD: 'FLEET_CARD',
  OTHER: 'OTHER',
} as const;
export type PaymentType = (typeof PaymentType)[keyof typeof PaymentType];

export const VehicleMaintenanceStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_PARTS: 'WAITING_PARTS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type VehicleMaintenanceStatus =
  (typeof VehicleMaintenanceStatus)[keyof typeof VehicleMaintenanceStatus];

export const VehicleMaintenanceType = {
  PREVENTIVE: 'PREVENTIVE',
  CORRECTIVE: 'CORRECTIVE',
  INSPECTION: 'INSPECTION',
  EMERGENCY: 'EMERGENCY',
  OTHER: 'OTHER',
} as const;
export type VehicleMaintenanceType =
  (typeof VehicleMaintenanceType)[keyof typeof VehicleMaintenanceType];

export const VehicleMaintenancePriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type VehicleMaintenancePriority =
  (typeof VehicleMaintenancePriority)[keyof typeof VehicleMaintenancePriority];

// Fase 45 -- catalogo de componentes/itens de manutencao.
export const MaintenanceComponent = {
  ENGINE: 'ENGINE',
  TRANSMISSION: 'TRANSMISSION',
  DIFFERENTIAL: 'DIFFERENTIAL',
  BRAKES: 'BRAKES',
  SUSPENSION: 'SUSPENSION',
  CLUTCH: 'CLUTCH',
  TIRES: 'TIRES',
  COOLING: 'COOLING',
  ELECTRICAL: 'ELECTRICAL',
  ARLA: 'ARLA',
  FILTERS: 'FILTERS',
  ENGINE_OIL: 'ENGINE_OIL',
  TRANSMISSION_OIL: 'TRANSMISSION_OIL',
  DIFFERENTIAL_OIL: 'DIFFERENTIAL_OIL',
  DIESEL_FILTER: 'DIESEL_FILTER',
  AIR_FILTER: 'AIR_FILTER',
  OIL_FILTER: 'OIL_FILTER',
  BATTERY: 'BATTERY',
  SPRINGS: 'SPRINGS',
  SHOCK_ABSORBERS: 'SHOCK_ABSORBERS',
  SIDER: 'SIDER',
  TRAILER: 'TRAILER',
  OTHER: 'OTHER',
} as const;
export type MaintenanceComponent = (typeof MaintenanceComponent)[keyof typeof MaintenanceComponent];

export const TireStatus = {
  NEW: 'NEW',
  IN_USE: 'IN_USE',
  STOCK: 'STOCK',
  RETREADED: 'RETREADED',
  SCRAPPED: 'SCRAPPED',
} as const;
export type TireStatus = (typeof TireStatus)[keyof typeof TireStatus];

export const TireLocationType = {
  STOCK: 'STOCK',
  VEHICLE: 'VEHICLE',
  TRAILER: 'TRAILER',
} as const;
export type TireLocationType = (typeof TireLocationType)[keyof typeof TireLocationType];

export const TrailerType = {
  SIMPLE: 'SIMPLE',
  BITREM: 'BITREM',
  RODOTREM: 'RODOTREM',
  VANDERLEIA: 'VANDERLEIA',
  FULL_TRAILER: 'FULL_TRAILER',
  SEMI_TRAILER: 'SEMI_TRAILER',
  DOLLY: 'DOLLY',
  OTHER: 'OTHER',
} as const;
export type TrailerType = (typeof TrailerType)[keyof typeof TrailerType];

export const TripStatus = {
  PLANNED: 'PLANNED',
  WAITING_DRIVER: 'WAITING_DRIVER',
  WAITING_DEPARTURE: 'WAITING_DEPARTURE',
  IN_PROGRESS: 'IN_PROGRESS',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type TripStatus = (typeof TripStatus)[keyof typeof TripStatus];

export const TripPriority = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type TripPriority = (typeof TripPriority)[keyof typeof TripPriority];

// Fase 27 -- carregado/vazio, informado pelo motorista na largada.
export const TripLoadStatus = {
  LOADED: 'LOADED',
  EMPTY: 'EMPTY',
} as const;
export type TripLoadStatus = (typeof TripLoadStatus)[keyof typeof TripLoadStatus];

// Fase 29 -- Alert passa a ter leitura no admin-web (painel de
// monitoramento); os dois enums espelham AlertType/AlertSeverity do backend.
export const AlertType = {
  ROUTE_DEVIATION: 'ROUTE_DEVIATION',
  TOLL_DISCREPANCY: 'TOLL_DISCREPANCY',
  DELAY: 'DELAY',
  ROUTE_EVENT: 'ROUTE_EVENT',
  DOCUMENT_EXPIRING: 'DOCUMENT_EXPIRING',
  OTHER: 'OTHER',
} as const;
export type AlertType = (typeof AlertType)[keyof typeof AlertType];

export const AlertSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export const RouteEventType = {
  DEVIATION: 'DEVIATION',
  ACCIDENT: 'ACCIDENT',
  ROADWORK: 'ROADWORK',
  INTERDICTION: 'INTERDICTION',
  DESTINATION_CHANGE: 'DESTINATION_CHANGE',
} as const;
export type RouteEventType = (typeof RouteEventType)[keyof typeof RouteEventType];

export const RouteVersionReason = {
  INITIAL: 'INITIAL',
  DEVIATION: 'DEVIATION',
  ACCIDENT: 'ACCIDENT',
  ROADWORK: 'ROADWORK',
  INTERDICTION: 'INTERDICTION',
  DESTINATION_CHANGE: 'DESTINATION_CHANGE',
} as const;
export type RouteVersionReason = (typeof RouteVersionReason)[keyof typeof RouteVersionReason];

// Fase 26 -- roteirizacao geografica.
export const RouteTollEstimateSource = {
  MATCHED_PLAZAS: 'MATCHED_PLAZAS',
  PROVIDER_AGGREGATE: 'PROVIDER_AGGREGATE',
  NONE: 'NONE',
} as const;
export type RouteTollEstimateSource =
  (typeof RouteTollEstimateSource)[keyof typeof RouteTollEstimateSource];

export const TollMatchStatus = { MATCHED: 'MATCHED', UNMATCHED: 'UNMATCHED' } as const;
export type TollMatchStatus = (typeof TollMatchStatus)[keyof typeof TollMatchStatus];

export const TollTransactionSource = { INTEGRATION: 'INTEGRATION', MANUAL: 'MANUAL' } as const;
export type TollTransactionSource =
  (typeof TollTransactionSource)[keyof typeof TollTransactionSource];

export const TollTransactionStatus = {
  NORMAL: 'NORMAL',
  DIVERGENT: 'DIVERGENT',
  EXEMPT: 'EXEMPT',
} as const;
export type TollTransactionStatus =
  (typeof TollTransactionStatus)[keyof typeof TollTransactionStatus];

export const ImportFileType = {
  CSV: 'CSV',
  XLSX: 'XLSX',
  XML: 'XML',
  TXT: 'TXT',
  API_INTEGRATION: 'API_INTEGRATION',
} as const;
export type ImportFileType = (typeof ImportFileType)[keyof typeof ImportFileType];

export const ImportJobStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  PARTIAL_SUCCESS: 'PARTIAL_SUCCESS',
} as const;
export type ImportJobStatus = (typeof ImportJobStatus)[keyof typeof ImportJobStatus];

export const ImportRowIssueType = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE: 'DUPLICATE',
} as const;
export type ImportRowIssueType = (typeof ImportRowIssueType)[keyof typeof ImportRowIssueType];

export const ExpenseCategory = {
  FUEL: 'FUEL',
  FOOD: 'FOOD',
  HOTEL: 'HOTEL',
  TOLL_EXTRA: 'TOLL_EXTRA',
  MAINTENANCE: 'MAINTENANCE',
  TIRES: 'TIRES',
  PARKING: 'PARKING',
  WASH: 'WASH',
  ADVANCE: 'ADVANCE',
  FINE: 'FINE',
  OTHER: 'OTHER',
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];

export const ExpenseStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type ExpenseStatus = (typeof ExpenseStatus)[keyof typeof ExpenseStatus];

export const ExpensePaymentMethod = {
  CASH: 'CASH',
  CREDIT_CARD: 'CREDIT_CARD',
  DEBIT_CARD: 'DEBIT_CARD',
  PIX: 'PIX',
  BANK_TRANSFER: 'BANK_TRANSFER',
  COMPANY_ACCOUNT: 'COMPANY_ACCOUNT',
  OTHER: 'OTHER',
} as const;
export type ExpensePaymentMethod = (typeof ExpensePaymentMethod)[keyof typeof ExpensePaymentMethod];

export const RevenueCategory = {
  FREIGHT: 'FREIGHT',
  BONUS: 'BONUS',
  EXTRA_SERVICE: 'EXTRA_SERVICE',
  INSURANCE: 'INSURANCE',
  OTHER: 'OTHER',
} as const;
export type RevenueCategory = (typeof RevenueCategory)[keyof typeof RevenueCategory];

export const SettlementStatus = { OPEN: 'OPEN', CLOSED: 'CLOSED', REOPENED: 'REOPENED' } as const;
export type SettlementStatus = (typeof SettlementStatus)[keyof typeof SettlementStatus];

export const LocationType = {
  FACTORY: 'FACTORY',
  DISTRIBUTION_CENTER: 'DISTRIBUTION_CENTER',
  PORT: 'PORT',
  TERMINAL: 'TERMINAL',
  CUSTOMER_SITE: 'CUSTOMER_SITE',
  BRANCH: 'BRANCH',
  OTHER: 'OTHER',
} as const;
export type LocationType = (typeof LocationType)[keyof typeof LocationType];

export const DocumentType = {
  CRLV: 'CRLV',
  ANTT: 'ANTT',
  CNH: 'CNH',
  MEDICAL_EXAM: 'MEDICAL_EXAM',
  MOPP: 'MOPP',
  LICENSING: 'LICENSING',
  INSURANCE: 'INSURANCE',
  OTHER: 'OTHER',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

// Fase 25 -- operacao da viagem (app do motorista). Fase 43 amplia o
// catalogo (aditivo, nenhum valor removido/renomeado -- espelha
// TripStopType do schema.prisma).
export const TripStopType = {
  UNKNOWN: 'UNKNOWN',
  FUEL: 'FUEL',
  REST: 'REST',
  MEAL: 'MEAL',
  MAINTENANCE: 'MAINTENANCE',
  OTHER: 'OTHER',
  LOADING: 'LOADING',
  UNLOADING: 'UNLOADING',
  WAITING_LOADING: 'WAITING_LOADING',
  WAITING_UNLOADING: 'WAITING_UNLOADING',
  YARD: 'YARD',
  CUSTOMER: 'CUSTOMER',
  GARAGE: 'GARAGE',
  BREAKDOWN: 'BREAKDOWN',
  TIRE: 'TIRE',
  CONGESTION: 'CONGESTION',
  ACCIDENT: 'ACCIDENT',
  ROAD_CLOSURE: 'ROAD_CLOSURE',
  INSPECTION: 'INSPECTION',
  PERSONAL_NEED: 'PERSONAL_NEED',
  DOCUMENTATION: 'DOCUMENTATION',
  WAITING_AUTHORIZATION: 'WAITING_AUTHORIZATION',
} as const;
export type TripStopType = (typeof TripStopType)[keyof typeof TripStopType];

// Fase 43 -- espelha TripStopSource do schema.prisma.
export const TripStopSource = {
  MANUAL: 'MANUAL',
  DRIVER_APP: 'DRIVER_APP',
  GPS: 'GPS',
  SYSTEM: 'SYSTEM',
  IMPORT: 'IMPORT',
  ADMIN: 'ADMIN',
} as const;
export type TripStopSource = (typeof TripStopSource)[keyof typeof TripStopSource];

// Fase 43 -- espelha TripStopStatus (apps/api/src/trip-operations/entities/
// trip-stop.entity.ts): sempre derivado (endedAt/cancelledAt), nunca uma
// coluna propria.
export const TripStopStatus = {
  OPEN: 'OPEN',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type TripStopStatus = (typeof TripStopStatus)[keyof typeof TripStopStatus];

export const AxleEventSource = {
  DRIVER_INPUT: 'DRIVER_INPUT',
  TIMEOUT_DEFAULT: 'TIMEOUT_DEFAULT',
} as const;
export type AxleEventSource = (typeof AxleEventSource)[keyof typeof AxleEventSource];

export const SyncStatus = {
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  FAILED: 'FAILED',
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

// Fase 38 -- checklist operacional (Template -> Section -> Item -> Execution -> Answer -> Evidence).
export const ChecklistType = {
  PRE_TRIP: 'PRE_TRIP',
  POST_TRIP: 'POST_TRIP',
  MAINTENANCE: 'MAINTENANCE',
  TRAILER: 'TRAILER',
  SAFETY: 'SAFETY',
  ACCIDENT: 'ACCIDENT',
  AUDIT: 'AUDIT',
} as const;
export type ChecklistType = (typeof ChecklistType)[keyof typeof ChecklistType];

export const ChecklistTemplateStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ChecklistTemplateStatus = (typeof ChecklistTemplateStatus)[keyof typeof ChecklistTemplateStatus];

// So BOOLEAN e funcionalmente validado ponta a ponta nesta fase -- os
// demais existem como preparacao arquitetural (ver docs/checklist-module.md).
export const ChecklistItemType = {
  BOOLEAN: 'BOOLEAN',
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  PHOTO: 'PHOTO',
  SIGNATURE: 'SIGNATURE',
  ODOMETER: 'ODOMETER',
  SELECT: 'SELECT',
} as const;
export type ChecklistItemType = (typeof ChecklistItemType)[keyof typeof ChecklistItemType];

export const ChecklistExecutionStatus = {
  DRAFT: 'DRAFT',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type ChecklistExecutionStatus = (typeof ChecklistExecutionStatus)[keyof typeof ChecklistExecutionStatus];

export const ChecklistEvidenceType = {
  ODOMETER: 'ODOMETER',
  AXLE_1: 'AXLE_1',
  AXLE_2: 'AXLE_2',
  AXLE_3: 'AXLE_3',
  GENERAL: 'GENERAL',
  DAMAGE: 'DAMAGE',
  SIGNATURE: 'SIGNATURE',
} as const;
export type ChecklistEvidenceType = (typeof ChecklistEvidenceType)[keyof typeof ChecklistEvidenceType];

// Fase 47 -- Super Administracao da Plataforma.
export const TenantStatus = {
  ACTIVE: 'ACTIVE',
  TRIAL: 'TRIAL',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const TenantPlanTier = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  PROFESSIONAL: 'PROFESSIONAL',
  ENTERPRISE: 'ENTERPRISE',
} as const;
export type TenantPlanTier = (typeof TenantPlanTier)[keyof typeof TenantPlanTier];

export const TenantModule = {
  TRIPS: 'TRIPS',
  TOLLS: 'TOLLS',
  FUEL: 'FUEL',
  MAINTENANCE: 'MAINTENANCE',
  TIRES: 'TIRES',
  CHECKLIST: 'CHECKLIST',
  STOPS: 'STOPS',
  DASHBOARDS: 'DASHBOARDS',
  REPORTS: 'REPORTS',
  // Fase 59 -- faltava neste espelho (o nav-config nunca precisou gatear
  // nenhum item por este modulo ate a Fase 72).
  FREIGHT: 'FREIGHT',
} as const;
export type TenantModule = (typeof TenantModule)[keyof typeof TenantModule];

// Fase 50 -- Gestao Manual de Assinaturas e Cobranca.
export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING',
  OVERDUE: 'OVERDUE',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const SubscriptionPaymentMethod = {
  PIX_SCHEDULED: 'PIX_SCHEDULED',
  DIRECT_DEBIT: 'DIRECT_DEBIT',
  STRIPE: 'STRIPE',
} as const;
export type SubscriptionPaymentMethod = (typeof SubscriptionPaymentMethod)[keyof typeof SubscriptionPaymentMethod];

export const BillingPeriodicity = {
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
} as const;
export type BillingPeriodicity = (typeof BillingPeriodicity)[keyof typeof BillingPeriodicity];

export const SubscriptionPaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
} as const;
export type SubscriptionPaymentStatus = (typeof SubscriptionPaymentStatus)[keyof typeof SubscriptionPaymentStatus];

// Fase 52 -- Fiscal/Documental.
export const FiscalDocumentType = {
  CTE: 'CTE',
  MDFE: 'MDFE',
  NFE: 'NFE',
  CIOT: 'CIOT',
  DACTE: 'DACTE',
  DAMDFE: 'DAMDFE',
  DELIVERY_PROOF: 'DELIVERY_PROOF',
  OTHER: 'OTHER',
} as const;
export type FiscalDocumentType = (typeof FiscalDocumentType)[keyof typeof FiscalDocumentType];

// status=VALID significa apenas "estrutura/conteudo basico reconhecido pelo
// sistema" -- NUNCA validacao fiscal oficial perante a SEFAZ.
export const FiscalDocumentStatus = {
  PENDING: 'PENDING',
  VALID: 'VALID',
  INVALID: 'INVALID',
  CANCELLED: 'CANCELLED',
} as const;
export type FiscalDocumentStatus = (typeof FiscalDocumentStatus)[keyof typeof FiscalDocumentStatus];

export const FiscalDocumentSource = {
  UPLOAD: 'UPLOAD',
  XML_IMPORT: 'XML_IMPORT',
} as const;
export type FiscalDocumentSource = (typeof FiscalDocumentSource)[keyof typeof FiscalDocumentSource];

// Fase 54 -- motivos OBJETIVOS de inconsistencia estrutural (nunca fiscal/
// SEFAZ). "XML invalido" nao aparece aqui: nunca e persistido (rejeitado com
// 400 na importacao).
export const FiscalIssueCode = {
  INVALID_ACCESS_KEY: 'INVALID_ACCESS_KEY',
  TYPE_MISMATCH: 'TYPE_MISMATCH',
  ESSENTIAL_FIELDS_MISSING: 'ESSENTIAL_FIELDS_MISSING',
  INCONSISTENT_DATE: 'INCONSISTENT_DATE',
  DUPLICATE_CANDIDATE: 'DUPLICATE_CANDIDATE',
  INCONSISTENT_LINK: 'INCONSISTENT_LINK',
  NO_TRIP_CONTEXT: 'NO_TRIP_CONTEXT',
} as const;
export type FiscalIssueCode = (typeof FiscalIssueCode)[keyof typeof FiscalIssueCode];

// Fase 55 -- situacao documental da viagem. NUNCA "conformidade SEFAZ":
// classificacao interna sobre a coerencia/estrutura dos dados existentes.
export const TripDocumentComplianceStatus = {
  OK: 'OK',
  ATTENTION: 'ATTENTION',
  PROBLEMATIC: 'PROBLEMATIC',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;
export type TripDocumentComplianceStatus = (typeof TripDocumentComplianceStatus)[keyof typeof TripDocumentComplianceStatus];

// Fase 56 -- status do comprovante de entrega, derivado (nunca uma maquina
// de estados nova). "Arquivo existente" nunca e tratado como AVAILABLE por
// si so -- so quando estruturalmente valido.
export const DeliveryProofStatus = {
  MISSING: 'MISSING',
  PENDING: 'PENDING',
  AVAILABLE: 'AVAILABLE',
  PROBLEMATIC: 'PROBLEMATIC',
} as const;
export type DeliveryProofStatus = (typeof DeliveryProofStatus)[keyof typeof DeliveryProofStatus];

// Fase 59 -- Gestao de Fretes, Contratos e Tabelas de Frete.
export const ContractStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

export const FreightTableStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type FreightTableStatus = (typeof FreightTableStatus)[keyof typeof FreightTableStatus];

// ACTIVE = pode ser selecionada pelo motor de calculo; ARCHIVED = fechada
// por uma nova versao, preservada so para historico.
export const FreightRuleStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type FreightRuleStatus = (typeof FreightRuleStatus)[keyof typeof FreightRuleStatus];

// Fase 60 -- Faturamento Operacional e Conciliacao Comercial. PAID/
// CANCELLED sao sempre transicoes manuais explicitas -- as demais sao
// derivadas de billableAmount/invoicedAmount (ver billing-status.util.ts
// no backend).
export const TripBillingStatus = {
  DRAFT: 'DRAFT',
  READY: 'READY',
  PARTIALLY_INVOICED: 'PARTIALLY_INVOICED',
  INVOICED: 'INVOICED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type TripBillingStatus = (typeof TripBillingStatus)[keyof typeof TripBillingStatus];

// Fase 61 -- Motoristas, Agregados e Terceiros.
export const DriverType = {
  OWN: 'OWN',
  AGGREGATED: 'AGGREGATED',
  THIRD_PARTY: 'THIRD_PARTY',
} as const;
export type DriverType = (typeof DriverType)[keyof typeof DriverType];

export const DriverStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type DriverStatus = (typeof DriverStatus)[keyof typeof DriverStatus];

// Fase 62 -- Gestao Avancada de Veiculos e Frota.
export const VehicleOwnershipType = {
  OWN: 'OWN',
  AGGREGATED: 'AGGREGATED',
  THIRD_PARTY: 'THIRD_PARTY',
} as const;
export type VehicleOwnershipType = (typeof VehicleOwnershipType)[keyof typeof VehicleOwnershipType];

// Derivado (nunca persistido) -- ver VehicleEntity.availability no backend.
export const VehicleAvailability = {
  AVAILABLE: 'AVAILABLE',
  ON_TRIP: 'ON_TRIP',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;
export type VehicleAvailability = (typeof VehicleAvailability)[keyof typeof VehicleAvailability];

export const DocumentExpiryStatus = {
  VALID: 'VALID',
  EXPIRING_SOON: 'EXPIRING_SOON',
  EXPIRED: 'EXPIRED',
  NO_EXPIRY: 'NO_EXPIRY',
} as const;
export type DocumentExpiryStatus = (typeof DocumentExpiryStatus)[keyof typeof DocumentExpiryStatus];

export const FleetAlertSeverity = {
  INFO: 'INFO',
  ATTENTION: 'ATTENTION',
  CRITICAL: 'CRITICAL',
} as const;
export type FleetAlertSeverity = (typeof FleetAlertSeverity)[keyof typeof FleetAlertSeverity];

// Fase 67 -- espelha TripOccurrenceType/Severity/Status do backend
// (apps/api/src/trip-operations/entities/trip-occurrence.entity.ts).
export const TripOccurrenceType = {
  ACCIDENT: 'ACCIDENT',
  BREAKDOWN: 'BREAKDOWN',
  DELAY: 'DELAY',
  ROUTE_DEVIATION: 'ROUTE_DEVIATION',
  DELIVERY_PROBLEM: 'DELIVERY_PROBLEM',
  DOCUMENT_PROBLEM: 'DOCUMENT_PROBLEM',
  VEHICLE_PROBLEM: 'VEHICLE_PROBLEM',
  FUEL_PROBLEM: 'FUEL_PROBLEM',
  TIRE_PROBLEM: 'TIRE_PROBLEM',
  OTHER: 'OTHER',
} as const;
export type TripOccurrenceType = (typeof TripOccurrenceType)[keyof typeof TripOccurrenceType];

export const TripOccurrenceSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type TripOccurrenceSeverity = (typeof TripOccurrenceSeverity)[keyof typeof TripOccurrenceSeverity];

export const TripOccurrenceStatus = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
  CANCELLED: 'CANCELLED',
} as const;
export type TripOccurrenceStatus = (typeof TripOccurrenceStatus)[keyof typeof TripOccurrenceStatus];

// Fase 67 -- espelha DriverShiftStatus (sempre derivado de endedAt/
// cancelledAt, mesmo principio de TripStopStatus).
export const DriverShiftStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type DriverShiftStatus = (typeof DriverShiftStatus)[keyof typeof DriverShiftStatus];

// Fase 67 -- origem de cada item da timeline unificada (GET /trips/:id/timeline).
export const TripTimelineOrigin = {
  STOP: 'STOP',
  ROUTE_EVENT: 'ROUTE_EVENT',
  FUEL: 'FUEL',
  TOLL: 'TOLL',
  AXLE: 'AXLE',
  CHECKLIST: 'CHECKLIST',
  FISCAL: 'FISCAL',
  DELIVERY_PROOF: 'DELIVERY_PROOF',
  EXPENSE: 'EXPENSE',
  REVENUE: 'REVENUE',
  OCCURRENCE: 'OCCURRENCE',
  AUDIT: 'AUDIT',
} as const;
export type TripTimelineOrigin = (typeof TripTimelineOrigin)[keyof typeof TripTimelineOrigin];

// Fase 69 -- Centro de Alertas e Notificacoes.
export const NotificationType = {
  CRITICAL_OCCURRENCE: 'CRITICAL_OCCURRENCE',
  VEHICLE_UNAVAILABLE: 'VEHICLE_UNAVAILABLE',
  VEHICLE_MAINTENANCE: 'VEHICLE_MAINTENANCE',
  TIRE_NEAR_REPLACEMENT: 'TIRE_NEAR_REPLACEMENT',
  FUEL_ODOMETER_REGRESSION: 'FUEL_ODOMETER_REGRESSION',
  FISCAL_DOCUMENT_PROBLEM: 'FISCAL_DOCUMENT_PROBLEM',
  TRIP_DELAYED: 'TRIP_DELAYED',
  DRIVER_SUSPENDED: 'DRIVER_SUSPENDED',
  DRIVER_INACTIVE: 'DRIVER_INACTIVE',
  BILLING_PENDING: 'BILLING_PENDING',
  // Fase 70 -- comprovante de entrega (reaproveita a classificacao de
  // computeDeliveryProofStatus, ver docs/notifications.md).
  DELIVERY_PROOF_PENDING: 'DELIVERY_PROOF_PENDING',
  DELIVERY_PROOF_PROBLEM: 'DELIVERY_PROOF_PROBLEM',
} as const;

// Fase 72 -- Contas a Receber. Status ESCRITO (nunca contem OVERDUE --
// calculado ao vivo, ver ReceivableEffectiveStatus abaixo).
export const ReceivableStatus = {
  OPEN: 'OPEN',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type ReceivableStatus = (typeof ReceivableStatus)[keyof typeof ReceivableStatus];

// Status EFETIVO retornado pela API (o que a UI sempre exibe/filtra) --
// inclui OVERDUE, que nunca existe como valor persistido no backend.
export type ReceivableEffectiveStatus = ReceivableStatus | 'OVERDUE';

export const ReceivablePaymentMethod = {
  PIX: 'PIX',
  BANK_TRANSFER: 'BANK_TRANSFER',
  BOLETO: 'BOLETO',
  CASH: 'CASH',
  CHECK: 'CHECK',
  CARD: 'CARD',
  OTHER: 'OTHER',
} as const;
export type ReceivablePaymentMethod = (typeof ReceivablePaymentMethod)[keyof typeof ReceivablePaymentMethod];
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

// Fase 73 -- Contas a Pagar. Status ESCRITO (nunca contem OVERDUE --
// calculado ao vivo, ver PayableEffectiveStatus abaixo). paymentMethod e
// category reaproveitam ExpensePaymentMethod/ExpenseCategory ja
// existentes -- nenhum enum paralelo.
export const PayableStatus = {
  OPEN: 'OPEN',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type PayableStatus = (typeof PayableStatus)[keyof typeof PayableStatus];

// Status EFETIVO retornado pela API -- inclui OVERDUE, nunca persistido.
export type PayableEffectiveStatus = PayableStatus | 'OVERDUE';
