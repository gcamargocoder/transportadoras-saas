// Traducoes pt-BR para os enums do backend, usadas em toda a UI (badges,
// selects de filtro, formularios). Mantido centralizado para nao duplicar
// strings por tela.
import {
  AxleEventSource,
  DocumentType,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
  FleetType,
  FuelType,
  ImportJobStatus,
  LocationType,
  PaymentType,
  RevenueCategory,
  RouteTollEstimateSource,
  SettlementStatus,
  SyncStatus,
  TireLocationType,
  TireStatus,
  TollMatchStatus,
  TollTransactionStatus,
  TrailerType,
  TripPriority,
  TripStatus,
  TripStopType,
  UserRole,
  VehicleFuelType,
  VehicleMaintenancePriority,
  VehicleMaintenanceStatus,
  VehicleMaintenanceType,
  VehicleStatus,
  VehicleType,
} from '../types/enums';

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

export const TRIP_STOP_TYPE_LABELS: Record<TripStopType, string> = {
  UNKNOWN: 'Não classificada',
  FUEL: 'Abastecimento',
  REST: 'Descanso',
  MEAL: 'Refeição',
  MAINTENANCE: 'Manutenção',
  OTHER: 'Outro',
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
