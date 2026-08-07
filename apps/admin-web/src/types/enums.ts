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

export const VehicleStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
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

export const RouteEventType = {
  DEVIATION: 'DEVIATION',
  ACCIDENT: 'ACCIDENT',
  ROADWORK: 'ROADWORK',
  INTERDICTION: 'INTERDICTION',
  DESTINATION_CHANGE: 'DESTINATION_CHANGE',
} as const;
export type RouteEventType = (typeof RouteEventType)[keyof typeof RouteEventType];

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
