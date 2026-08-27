// Tipos espelhando 1:1 as *Entity do backend (apps/api/src/**/entities).
// Datas chegam como string ISO 8601 (serializacao JSON), nunca Date.
// Nao inventar campos: qualquer campo aqui precisa existir na entity real.
import type { PaginationMeta } from './api';
import type {
  AlertSeverity,
  AlertType,
  AxleEventSource,
  ChecklistEvidenceType,
  ChecklistExecutionStatus,
  ChecklistItemType,
  ChecklistTemplateStatus,
  ChecklistType,
  ContractRenewalStatus,
  ContractStatus,
  DeliveryProofStatus,
  DocumentType,
  DriverStatus,
  DriverType,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
  FinancialAccountType,
  FinancialBankTransactionStatus,
  FinancialTransactionType,
  FiscalDocumentSource,
  FiscalDocumentStatus,
  FiscalDocumentType,
  FiscalIssueCode,
  FinancialPeriodStatus,
  FleetType,
  FreightRuleStatus,
  FreightTableStatus,
  FuelType,
  ImportFileType,
  ImportJobStatus,
  ImportRowIssueType,
  LocationType,
  MaintenanceComponent,
  MaintenanceProviderType,
  PartStockMovementType,
  PayableEffectiveStatus,
  PaymentType,
  ProposalStatus,
  QuotationAmountSource,
  QuotationStatus,
  ReceivableEffectiveStatus,
  ReceivablePaymentMethod,
  RevenueCategory,
  RouteTollEstimateSource,
  RouteVersionReason,
  SettlementStatus,
  BillingPeriodicity,
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
  TollTransactionSource,
  TollTransactionStatus,
  TrailerType,
  TripBillingStatus,
  TripDocumentComplianceStatus,
  TripLoadStatus,
  TripPriority,
  TripStatus,
  TripDeliveryStopStatus,
  TripEtaSource,
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
  VehicleAvailability,
  FleetAvailabilityStatus,
  VehicleOwnershipType,
  VehicleStatus,
  VehicleType,
  DocumentExpiryStatus,
} from './enums';

export interface UserEntity {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettingsEntity {
  timezone: string;
  currency: string;
  language: string;
  gpsPingIntervalSeconds: number;
  maxDeviationMeters: number;
  alertDelayThresholdMin: number;
  preferences: Record<string, unknown> | null;
}

// Fase 47 -- Super Administracao da Plataforma.
export interface TenantPlanEntity {
  tier: TenantPlanTier;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  trialExpiringSoon: boolean;
  maxUsers: number | null;
  maxVehicles: number | null;
  maxDrivers: number | null;
  maxStorageMb: number | null;
  enabledModules: TenantModule[];
}

export interface TenantEntity {
  id: string;
  name: string;
  tradeName: string | null;
  document: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
  status: TenantStatus;
  settings: TenantSettingsEntity | null;
  plan: TenantPlanEntity | null;
  createdAt: string;
  updatedAt: string;
}

// GET /tenants (SUPER_ADMIN) -- item da listagem, com contagens resolvidas
// em lote para a pagina inteira (nunca 1 query por linha no backend).
export interface TenantListItemEntity extends TenantEntity {
  userCount: number;
  vehicleCount: number;
}

// GET /tenants/:id/usage (SUPER_ADMIN).
export interface TenantUsageEntity {
  users: number;
  drivers: number;
  vehicles: number;
  trips: number;
  checklistExecutions: number;
  fuelSupplies: number;
  maintenances: number;
  attachments: number;
  storageUsedMb: number;
}

export interface PlatformTenantStatusBreakdownEntity {
  status: TenantStatus;
  count: number;
}

export interface PlatformPlanTierBreakdownEntity {
  tier: TenantPlanTier;
  count: number;
}

// GET /tenants/dashboard (SUPER_ADMIN) -- dashboard global da plataforma.
export interface PlatformDashboardEntity {
  totalTenants: number;
  byStatus: PlatformTenantStatusBreakdownEntity[];
  totalUsers: number;
  totalVehicles: number;
  totalDrivers: number;
  byPlanTier: PlatformPlanTierBreakdownEntity[];
  tripsCompletedLast30Days: number;
  checklistsCompletedLast30Days: number;
}

// Fase 50 -- Gestao Manual de Assinaturas e Cobranca.
export interface SubscriptionEntity {
  id: string;
  tenantId: string;
  tenantName: string;
  planTier: TenantPlanTier;
  amount: number;
  periodicity: BillingPeriodicity;
  paymentMethod: SubscriptionPaymentMethod;
  startDate: string;
  dueDay: number;
  nextDueDate: string;
  status: SubscriptionStatus;
  daysOverdue: number;
  notes: string | null;
  lastPaymentAt: string | null;
  lastPaymentStatus: SubscriptionPaymentStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPaymentEntity {
  id: string;
  tenantId: string;
  subscriptionId: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  paymentMethod: SubscriptionPaymentMethod;
  status: SubscriptionPaymentStatus;
  reference: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface UpcomingDueEntity {
  tenantId: string;
  tenantName: string;
  amount: number;
  nextDueDate: string;
}

export interface BillingDashboardEntity {
  monthlyProjectedRevenue: number;
  annualProjectedRevenue: number;
  receivedInPeriod: number;
  pendingAmount: number;
  overdueAmount: number;
  activeSubscriptions: number;
  totalSubscriptions: number;
  overdueSubscriptions: number;
  upcomingDueDates: UpcomingDueEntity[];
}

export interface DriverEntity {
  id: string;
  tenantId: string;
  userAccountId: string | null;
  name: string;
  cpf: string;
  rg: string | null;
  cnhNumber: string;
  cnhCategory: string;
  cnhExpiresAt: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  notes: string | null;
  admissionDate: string | null;
  terminationDate: string | null;
  isActive: boolean;
  type: DriverType;
  status: DriverStatus;
  isAvailable: boolean;
  currentVehicleId: string | null;
  currentVehiclePlate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriverVehicleAssignmentEntity {
  id: string;
  driverId: string;
  vehicleId: string;
  vehiclePlate: string | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
}

export interface DriverSummaryEntity {
  totalOwn: number;
  totalAggregated: number;
  totalThirdParty: number;
  totalActive: number;
  totalInactive: number;
  totalSuspended: number;
}

export interface DriverDocumentEntity {
  id: string;
  driverId: string;
  type: DocumentType;
  number: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface FleetEntity {
  id: string;
  tenantId: string;
  name: string;
  type: FleetType;
  locationId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleEntity {
  id: string;
  tenantId: string;
  fleetId: string | null;
  plate: string;
  renavam: string | null;
  chassisNumber: string | null;
  brand: string;
  model: string;
  manufactureYear: number | null;
  modelYear: number | null;
  color: string | null;
  type: VehicleType;
  category: string | null;
  fuelType: VehicleFuelType | null;
  tankCapacityLiters: number | null;
  averageConsumptionKmL: number | null;
  odometerKm: number | null;
  grossWeightKg: number | null;
  netWeightKg: number | null;
  cargoCapacityKg: number | null;
  axleCount: number | null;
  notes: string | null;
  status: VehicleStatus;
  ownershipType: VehicleOwnershipType;
  currentDriverId: string | null;
  currentDriverName: string | null;
  availability: VehicleAvailability;
  // Fase 86 -- visao operacional detalhada (5 categorias), nao substitui `availability` acima.
  fleetAvailabilityStatus: FleetAvailabilityStatus;
  unavailabilityReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// Fase 86 -- quantidade + percentual por status operacional (5 categorias),
// reaproveitando as mesmas contagens de VehicleSummaryEntity abaixo.
export interface VehicleAvailabilityBreakdownEntity {
  status: FleetAvailabilityStatus;
  count: number;
  percent: number;
}

// Fase 62 -- Gestao Avancada de Veiculos e Frota.
export interface VehicleSummaryEntity {
  total: number;
  totalActive: number;
  totalInactive: number;
  totalSuspended: number;
  totalMaintenance: number;
  totalAvailable: number;
  totalUnavailable: number;
  totalOnTrip: number;
  totalOwn: number;
  totalAggregated: number;
  totalThirdParty: number;
  availabilityBreakdown: VehicleAvailabilityBreakdownEntity[];
}

export interface VehicleDriverAssignmentEntity {
  id: string;
  vehicleId: string;
  driverId: string;
  driverName: string | null;
  driverType: DriverType | null;
  driverStatus: DriverStatus | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
}

export interface VehicleDocumentEntity {
  id: string;
  vehicleId: string;
  type: DocumentType;
  number: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  expiryStatus: DocumentExpiryStatus;
  createdAt: string;
}

export interface VehicleCurrentDriverEntity {
  driverId: string;
  driverName: string;
  driverType: DriverType;
  driverStatus: DriverStatus;
  startedAt: string;
}

export interface VehicleCurrentTripEntity {
  tripId: string;
  status: TripStatus;
  driverId: string | null;
  driverName: string | null;
  customerId: string | null;
  customerName: string | null;
  originName: string | null;
  destinationName: string | null;
  plannedDeparture: string | null;
  plannedArrival: string | null;
  actualDeparture: string | null;
}

export interface VehicleRecentTripEntity {
  tripId: string;
  status: TripStatus;
  driverName: string | null;
  originName: string | null;
  destinationName: string | null;
  plannedDeparture: string | null;
  createdAt: string;
}

export interface VehicleMetricsEntity {
  totalTrips: number;
  completedTrips: number;
  inProgressTrips: number;
  cancelledTrips: number;
  totalDistanceKm: number | null;
  totalRevenue: number;
  totalExpenses: number;
  totalCost: number;
  financialResult: number;
  marginPercent: number | null;
  documentsCount: number;
  documentsProblematic: number;
  maintenancesCount: number;
  fuelSuppliesCount: number;
  lastFuelSupplyLiters: number | null;
  lastFuelSupplyAmount: number | null;
  lastFuelSupplyDate: string | null;
  averageFuelConsumptionKmL: number | null;
  driverHistoryCount: number;
  tiresCount: number;
  tiresNearReplacement: number;
}

export interface VehicleTireSummaryEntity {
  tireId: string;
  fireNumber: string;
  manufacturer: string;
  model: string;
  status: TireStatus;
  position: string | null;
  currentTreadDepthMm: number | null;
  installedAt: string | null;
}

export interface VehicleOverviewEntity {
  vehicle: VehicleEntity;
  currentDriver: VehicleCurrentDriverEntity | null;
  currentTrip: VehicleCurrentTripEntity | null;
  currentTripInconsistent: boolean;
  metrics: VehicleMetricsEntity;
  documents: VehicleDocumentEntity[];
  alerts: FleetAlertEntity[];
  driverHistory: VehicleDriverAssignmentEntity[];
  recentTrips: VehicleRecentTripEntity[];
  history: AuditLogEntity[];
  tires: VehicleTireSummaryEntity[];
}

export interface TrailerEntity {
  id: string;
  tenantId: string;
  plate: string;
  type: TrailerType;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TagProviderEntity {
  id: string;
  name: string;
  isActive: boolean;
  website: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleTagEntity {
  id: string;
  vehicleId: string;
  tagProviderId: string;
  tagNumber: string;
  isActive: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface AxleConfigurationEntity {
  id: string;
  totalAxles: number;
  raisedAxles: number;
  loweredAxles: number;
  suspendedAxles: number;
  steeringAxles: number;
  tractionAxles: number;
  billableCategory: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripCompositionTrailerEntity {
  trailerId: string;
  positionOrder: number;
  trailerPlate: string;
}

export interface TripCompositionEntity {
  id: string;
  tenantId: string;
  tripId: string | null;
  vehicleId: string;
  vehiclePlate: string;
  trailers: TripCompositionTrailerEntity[];
  axleConfiguration: AxleConfigurationEntity | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenancePartEntity {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface MaintenanceEntity {
  id: string;
  tenantId: string;
  vehicleId: string;
  vehiclePlate: string | null;
  type: VehicleMaintenanceType;
  status: VehicleMaintenanceStatus;
  priority: VehicleMaintenancePriority;
  openedAt: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  diagnosis: string | null;
  odometerKm: number | null;
  completionOdometerKm: number | null;
  workshop: string | null;
  supplier: string | null;
  mechanic: string | null;
  workshopId: string | null;
  workshopName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  responsibleUserId: string | null;
  description: string | null;
  notes: string | null;
  laborCost: number | null;
  partsCost: number | null;
  totalCost: number | null;
  serviceOrderNumber: string | null;
  warrantyUntil: string | null;
  nextReviewAt: string | null;
  component: MaintenanceComponent | null;
  nextOdometerKm: number | null;
  downtimeMinutes: number | null;
  invoiceNumber: string | null;
  maintenancePlanId: string | null;
  parts: MaintenancePartEntity[];
  createdAt: string;
  updatedAt: string;
}

export interface MaintenancePlanEntity {
  id: string;
  vehicleId: string;
  name: string;
  component: MaintenanceComponent;
  maintenanceType: VehicleMaintenanceType;
  intervalKm: number | null;
  intervalDays: number | null;
  intervalHours: number | null;
  alertBeforeKm: number | null;
  alertBeforeDays: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerEntity {
  id: string;
  tenantId: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Fase 93 -- CRM: pessoas de contato do cliente.
export interface CustomerContactEntity {
  id: string;
  tenantId: string;
  customerId: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

// Fase 93 -- CRM: observacoes/interacoes comerciais (append-only).
export interface CustomerNoteEntity {
  id: string;
  tenantId: string;
  customerId: string;
  content: string;
  createdBy: string;
  createdAt: string;
}

// Fase 93 -- CRM: indicadores basicos, NAO financeiros (ver
// CustomerSummaryEntity no backend).
export interface CustomerTripsByStatusEntity {
  status: TripStatus;
  count: number;
}

export interface CustomerSummaryEntity {
  customerId: string;
  tripsTotal: number;
  tripsByStatus: CustomerTripsByStatusEntity[];
  firstTripAt: string | null;
  lastTripAt: string | null;
  contactsCount: number;
  notesCount: number;
  contractsTotal: number;
  activeContractsCount: number;
}

export interface LocationEntity {
  id: string;
  tenantId: string;
  name: string;
  type: LocationType;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripEntity {
  id: string;
  tenantId: string;
  customerId: string | null;
  customerName: string | null;
  driverId: string | null;
  driverName: string | null;
  originLocationId: string;
  originName: string;
  destinationLocationId: string;
  destinationName: string;
  compositionId: string | null;
  vehiclePlate: string | null;
  tollRouteId: string | null;
  tollRouteName: string | null;
  status: TripStatus;
  priority: TripPriority;
  notes: string | null;
  plannedDeparture: string | null;
  plannedArrival: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  loadStatus: TripLoadStatus | null;
  initialOdometerKm: number | null;
  currentOdometerKm: number | null;
  defaultAxles: number | null;
  createdAt: string;
  updatedAt: string;
}

// Espelha AuditLogEntity (apps/api/src/audit/entities/audit-log.entity.ts) --
// usado na aba "Linha do tempo" da viagem (Fase 28) para mostrar os eventos
// operacionais (inicio, pausa, retomada, chegada, conclusao...) sem inventar
// uma tabela de eventos separada.
export interface AuditLogEntity {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  entityName: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// Fase 29 -- espelha trip-operation.entity.ts (backend). Tipos literais
// (nao Prisma enum) porque OperationalStatus/MovementStatus/LocationFreshness
// sao derivados a cada consulta, nunca persistidos.
export type OperationalStatus =
  | 'MOVING'
  | 'STOPPED'
  | 'STALE'
  | 'OFF_ROUTE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'UNKNOWN';
export type MovementStatus = 'MOVING' | 'STOPPED' | 'UNKNOWN';
export type LocationFreshness = 'ONLINE' | 'STALE' | 'OFFLINE';

export interface TripOperationPositionEntity {
  latitude: number;
  longitude: number;
  recordedAt: string;
  speedKmh: number | null;
  headingDeg: number | null;
}

export interface TripOperationTollSummaryEntity {
  plannedCount: number;
  registeredCount: number;
  pendingCount: number;
  unplannedCount: number;
  // ReconciliationStatus e definido mais abaixo neste arquivo (espelha
  // computeReconciliationStatus() do backend, Fase 24).
  reconciliationStatus: ReconciliationStatus;
}

export interface TripOperationAlertEntity {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  createdAt: string;
}

export interface TripOperationEntity {
  tripId: string;
  status: TripStatus;
  operationalStatus: OperationalStatus;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  originName: string;
  destinationName: string;
  actualDeparture: string | null;
  initialOdometerKm: number | null;
  currentOdometerKm: number | null;
  lastPosition: TripOperationPositionEntity | null;
  minutesSinceLastUpdate: number | null;
  locationFreshness: LocationFreshness;
  movementStatus: MovementStatus;
  hasUnresolvedDeviation: boolean;
  hasRecalculatedRoute: boolean;
  routePlanId: string | null;
  defaultAxles: number | null;
  tollSummary: TripOperationTollSummaryEntity;
  alerts: TripOperationAlertEntity[];
}

export interface TripOperationsListEntity {
  items: TripOperationEntity[];
}

export interface RouteEventEntity {
  id: string;
  tripId: string;
  type: string;
  detectedAt: string;
  resolvedAt: string | null;
  resultingRouteVersionId: string | null;
}

export interface RouteVersionEntity {
  id: string;
  tripId: string;
  versionNumber: number;
  reason: string;
  createdAt: string;
}

export interface TripMetricsEntity {
  id: string;
  tripId: string;
  plannedDistanceKm: number | null;
  plannedDurationMin: number | null;
  plannedFuelLiters: number | null;
  plannedTollAmount: number | null;
  plannedTotalCost: number | null;
  actualDistanceKm: number | null;
  actualDurationMin: number | null;
  actualFuelLiters: number | null;
  actualTollAmount: number | null;
  actualTotalCost: number | null;
  updatedAt: string;
}

export interface TripSummaryEntity {
  tripId: string;
  status: TripStatus;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  originName: string;
  destinationName: string;
  plannedDeparture: string | null;
  plannedArrival: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  tollTransactionsCount: number;
  tollTransactionsTotal: number;
  plannedTotalCost: number | null;
  actualTotalCost: number | null;
}

export interface TollPlazaEntity {
  id: string;
  name: string;
  operator: string;
  highway: string | null;
  km: number | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  pricePerAxle: number | null;
  createdAt: string;
  updatedAt: string;
}

// Motor de conferencia (Fase 22) -- espelha
// apps/api/src/tolls/utils/toll-calculation.util.ts (TOLL_AUDIT_VERDICTS).
// Calculado em tempo de leitura pelo backend a partir do estado ATUAL de
// TollPlaza.pricePerAxle -- distinto de TollTransactionEntity.status (enum
// gravado no banco).
export type TollAuditVerdict = 'CORRECT' | 'OVERCHARGE' | 'UNDERCHARGE' | 'UNVERIFIABLE';

export interface TollTransactionEntity {
  id: string;
  tenantId: string;
  tripId: string;
  vehicleId: string;
  vehiclePlate: string | null;
  driverId: string | null;
  driverName: string | null;
  tollPlazaId: string;
  tollPlazaName: string;
  tagProviderId: string | null;
  tagProviderName: string | null;
  axleCount: number;
  expectedAmount: number;
  chargedAmount: number;
  discrepancyAmount: number;
  status: TollTransactionStatus;
  auditVerdict: TollAuditVerdict;
  auditMessage: string | null;
  chargedAt: string;
  source: TollTransactionSource;
  createdAt: string;
  updatedAt: string;
}

export interface TollDashboardGroupEntity {
  id: string | null;
  label: string;
  count: number;
  totalChargedAmount: number;
}

export interface TollDashboardStatusGroupEntity {
  status: TollTransactionStatus;
  count: number;
  totalChargedAmount: number;
}

export interface TollDashboardEntity {
  totalCount: number;
  totalChargedAmount: number;
  totalExpectedAmount: number;
  totalDiscrepancyAmount: number;
  countByStatus: TollDashboardStatusGroupEntity[];
  countByProvider: TollDashboardGroupEntity[];
  countByVehicle: TollDashboardGroupEntity[];
  countByDriver: TollDashboardGroupEntity[];
  countByPlaza: TollDashboardGroupEntity[];
  conferredCount: number;
  unverifiableCount: number;
  correctCount: number;
  overchargeCount: number;
  underchargeCount: number;
  conformityPercentage: number;
  monthlyTrendChargedAmount: DashboardChartPointEntity[];
}

// Rota de pedagio (Fase 23) -- corredor operacional do tenant (distinto de
// TollPlaza, que e dado global). Usado para determinar as pracas ESPERADAS
// de uma viagem, na conciliacao.
export interface TollRouteStopEntity {
  sequence: number;
  tollPlazaId: string;
  tollPlazaName: string;
  highway: string | null;
  pricePerAxle: number | null;
}

export interface TollRouteEntity {
  id: string;
  tenantId: string;
  name: string;
  originLabel: string;
  destinationLabel: string;
  isActive: boolean;
  stops: TollRouteStopEntity[];
  createdAt: string;
  updatedAt: string;
}

// Camada de conciliacao (Fase 23) -- espelha
// apps/api/src/toll-routes/utils/toll-reconciliation.util.ts. NOT_REGISTERED
// e o unico veredito novo em relacao ao TollAuditVerdict (Fase 22).
export type TollReconciliationStopVerdict = TollAuditVerdict | 'NOT_REGISTERED';

// Status geral da conciliacao (Fase 24) -- espelha RECONCILIATION_STATUSES
// em apps/api/src/toll-routes/utils/toll-reconciliation.util.ts.
export type ReconciliationStatus =
  'PENDING' | 'CONFORM' | 'ATTENTION' | 'CRITICAL' | 'UNVERIFIABLE';

export interface TollReconciliationStopEntity {
  sequence: number;
  tollPlazaId: string;
  tollPlazaName: string;
  highway: string | null;
  transactionId: string | null;
  axleCount: number | null;
  expectedAmount: number | null;
  chargedAmount: number | null;
  discrepancyAmount: number | null;
  verdict: TollReconciliationStopVerdict;
  message: string | null;
}

export interface TollReconciliationUnplannedEntity {
  transactionId: string;
  tollPlazaId: string;
  tollPlazaName: string;
  chargedAmount: number;
  chargedAt: string;
}

export interface TollReconciliationEntity {
  tripId: string;
  hasRoute: boolean;
  tollRouteId: string | null;
  tollRouteName: string | null;
  originLabel: string | null;
  destinationLabel: string | null;
  stops: TollReconciliationStopEntity[];
  unplannedTransactions: TollReconciliationUnplannedEntity[];
  expectedStopsCount: number;
  registeredStopsCount: number;
  reconciledStopsCount: number;
  correctCount: number;
  overchargeCount: number;
  underchargeCount: number;
  notRegisteredCount: number;
  unverifiableCount: number;
  unplannedCount: number;
  expectedTotalAmount: number;
  chargedTotalAmount: number;
  divergenceAmount: number;
  unplannedTotalAmount: number;
  conformityPercentage: number;
  isFullyReconciled: boolean;
  status: ReconciliationStatus;
}

export interface TollReconciliationDashboardEntity {
  totalTripsWithRoute: number;
  reconciledTripsCount: number;
  nonReconciledTripsCount: number;
  pendingTripsCount: number;
  conformTripsCount: number;
  attentionTripsCount: number;
  criticalTripsCount: number;
  unverifiableTripsCount: number;
  tripsWithNotRegisteredCount: number;
  tripsWithUnplannedCount: number;
  totalExpectedStops: number;
  totalRegisteredStops: number;
  totalNotRegisteredStops: number;
  totalUnplannedTransactions: number;
  totalUnplannedAmount: number;
  totalExpectedAmount: number;
  totalChargedAmount: number;
  totalDivergenceAmount: number;
  conformityPercentage: number;
}

export interface ImportJobEntity {
  id: string;
  tenantId: string;
  providerId: string;
  providerName: string;
  filename: string;
  originalFilename: string;
  fileType: ImportFileType;
  status: ImportJobStatus;
  importedRecords: number;
  ignoredRecords: number;
  errorRecords: number;
  totalRecords: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ImportJobErrorEntity {
  id: string;
  importJobId: string;
  rowNumber: number;
  issueType: ImportRowIssueType;
  message: string;
  rawData: Record<string, unknown>;
  createdAt: string;
}

export interface TripExpenseEntity {
  id: string;
  tenantId: string;
  tripId: string;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  category: ExpenseCategory;
  description: string;
  supplier: string | null;
  documentNumber: string | null;
  expenseDate: string;
  amount: number;
  currency: string;
  paymentMethod: ExpensePaymentMethod | null;
  status: ExpenseStatus;
  approvedBy: string | null;
  approverName: string | null;
  approvedAt: string | null;
  attachmentId: string | null;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripFinancialSummaryEntity {
  tripId: string;
  totalExpenses: number;
  fuelExpenses: number;
  foodExpenses: number;
  hotelExpenses: number;
  maintenanceExpenses: number;
  otherExpenses: number;
  tollExpenses: number;
  expenseCount: number;
  averageExpense: number;
  largestExpense: number;
}

export interface TripRevenueEntity {
  id: string;
  tenantId: string;
  tripId: string;
  description: string;
  category: RevenueCategory;
  amount: number;
  receivedAt: string;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  attachmentId: string | null;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripAdvanceEntity {
  id: string;
  tenantId: string;
  tripId: string;
  driverId: string;
  driverName: string | null;
  description: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod | null;
  paidAt: string;
  attachmentId: string | null;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripSettlementEntity {
  id: string | null;
  tripId: string;
  totalRevenue: number;
  totalExpenses: number;
  totalAdvances: number;
  netResult: number;
  status: SettlementStatus;
  closedBy: string | null;
  closedByName: string | null;
  closedAt: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TripFinancialDashboardEntity {
  tripId: string;
  totalRevenue: number;
  totalExpenses: number;
  totalAdvances: number;
  profit: number;
  netResult: number;
  marginPercentage: number;
  entryCount: number;
  revenueCount: number;
  expenseCount: number;
  advanceCount: number;
  largestExpense: number;
  largestRevenue: number;
  // Fase 51 -- visao de custo operacional completo (distinta de profit/
  // netResult acima, que servem o fechamento financeiro do motorista).
  fuelCost: number;
  tollCost: number;
  maintenanceCost: number | null;
  totalCost: number;
  grossResult: number;
  finalResult: number;
}

// GET /trips/:id/financial-result (Fase 71) -- resultado financeiro real da
// viagem: receita contratada/faturada/recebida, custos e metricas por km.
export interface TripFinancialResultEntity {
  tripId: string;
  contractedRevenue: number | null;
  invoicedRevenue: number;
  receivedRevenue: number;
  fuelCost: number;
  tollCost: number;
  expenseCost: number;
  totalCost: number;
  operatingResult: number | null;
  invoicedResult: number;
  receivedResult: number;
  profitMarginPercent: number | null;
  invoicedMarginPercent: number | null;
  receivedMarginPercent: number | null;
  distanceKm: number | null;
  revenuePerKm: number | null;
  costPerKm: number | null;
  profitPerKm: number | null;
}

export interface FuelStationEntity {
  id: string;
  tenantId: string;
  name: string;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FuelSupplyEntity {
  id: string;
  tenantId: string;
  vehicleId: string;
  vehiclePlate: string | null;
  driverId: string;
  driverName: string | null;
  tripId: string | null;
  fuelStationId: string;
  fuelStationName: string | null;
  attachmentId: string | null;
  fuelType: FuelType;
  liters: number;
  pricePerLiter: number;
  totalAmount: number;
  odometerKm: number;
  supplyDate: string;
  paymentType: PaymentType | null;
  invoiceNumber: string | null;
  notes: string | null;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleFuelHistoryEntity {
  vehicleId: string;
  items: FuelSupplyEntity[];
  suppliesCount: number;
  totalLiters: number;
  totalAmount: number;
  averageConsumptionKmL: number | null;
  hasOdometerRegression: boolean;
}

export interface FuelDashboardTopEntryEntity {
  id: string;
  label: string;
  count: number;
}

export interface FuelDashboardEntity {
  suppliesCount: number;
  totalLiters: number;
  totalAmount: number;
  averageConsumptionKmL: number | null;
  costPerKm: number | null;
  mostUsedStation: FuelDashboardTopEntryEntity | null;
  topVehicle: FuelDashboardTopEntryEntity | null;
  topDriver: FuelDashboardTopEntryEntity | null;
}

export interface TireEntity {
  id: string;
  tenantId: string;
  fireNumber: string;
  manufacturer: string;
  model: string;
  size: string;
  dot: string | null;
  serialNumber: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  expectedLifespanKm: number | null;
  initialTreadDepthMm: number | null;
  currentTreadDepthMm: number | null;
  status: TireStatus;
  locationType: TireLocationType;
  vehicleId: string | null;
  vehiclePlate: string | null;
  trailerId: string | null;
  trailerPlate: string | null;
  position: string | null;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
  lifecycle: TireLifecycleEntity | null;
}

export interface TireCostPerKmEntity {
  value: number | null;
  available: boolean;
  reason: string | null;
}

export interface TireLifecycleEntity {
  totalCost: number;
  interventionsCount: number;
  daysInstalled: number | null;
  costPerKm: TireCostPerKmEntity;
}

export interface TireMovementEntity {
  id: string;
  tireId: string;
  movementDate: string;
  previousLocationType: TireLocationType | null;
  previousVehicleId: string | null;
  previousVehiclePlate: string | null;
  previousTrailerId: string | null;
  previousTrailerPlate: string | null;
  previousPosition: string | null;
  newLocationType: TireLocationType;
  newVehicleId: string | null;
  newVehiclePlate: string | null;
  newTrailerId: string | null;
  newTrailerPlate: string | null;
  newPosition: string | null;
  odometerKm: number | null;
  reason: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
}

export interface TireRetreadEntity {
  id: string;
  tireId: string;
  company: string;
  cost: number;
  retreadDate: string;
  warranty: string | null;
  mileageKm: number | null;
  notes: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
}

export interface TireInspectionEntity {
  id: string;
  tireId: string;
  inspectionDate: string;
  treadDepthMm: number;
  pressurePsi: number | null;
  notes: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
}

export interface TireDisposalEntity {
  id: string;
  tireId: string;
  reason: string;
  disposalDate: string;
  odometerKm: number | null;
  residualValue: number | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
}

export type TireHistoryEventType = 'CREATED' | 'MOVEMENT' | 'RETREAD' | 'INSPECTION' | 'DISPOSAL';

export interface TireHistoryEventEntity {
  type: TireHistoryEventType;
  date: string;
  description: string;
  data: unknown;
}

export interface TireHistoryEntity {
  tireId: string;
  events: TireHistoryEventEntity[];
}

export interface TireDashboardStatusCountEntity {
  status: TireStatus;
  count: number;
}

export interface TireDashboardEntity {
  countByStatus: TireDashboardStatusCountEntity[];
  stockCount: number;
  inUseCount: number;
  scrappedCount: number;
  retreadedTiresCount: number;
  investedValue: number;
  retreadValue: number;
  averageLifespanKm: number;
  averageMileageKm: number;
  nearReplacementCount: number;
}

export interface DashboardChartPointEntity {
  month: string;
  value: number;
}

export interface DashboardChartsEntity {
  monthlyRevenue: DashboardChartPointEntity[];
  monthlyExpenses: DashboardChartPointEntity[];
  monthlyFuelCost: DashboardChartPointEntity[];
  monthlyTrips: DashboardChartPointEntity[];
}

export interface DashboardOverviewEntity {
  totalTrips: number;
  activeTrips: number;
  finishedTrips: number;
  cancelledTrips: number;
  totalDrivers: number;
  activeDrivers: number;
  totalVehicles: number;
  availableVehicles: number;
  maintenanceVehicles: number;
  fuelStations: number;
  customers: number;
}

export interface DashboardFinancialEntity {
  totalRevenue: number;
  approvedExpenses: number;
  advances: number;
  profit: number;
  netResult: number;
  averageTripRevenue: number;
  averageTripExpense: number;
  largestRevenue: number;
  largestExpense: number;
  margin: number;
}

export interface DashboardOperationalEntity {
  todayTrips: number;
  lateTrips: number;
  tripsInProgress: number;
  completedToday: number;
  kmDriven: number;
  averageTripDistance: number;
}

export interface DashboardFleetEntity {
  fuelConsumed: number;
  fuelCost: number;
  averageConsumptionKmL: number;
  costPerKm: number;
  maintenanceCost: number;
  maintenanceOpen: number;
  maintenanceClosed: number;
}

export interface DashboardEntity {
  overview: DashboardOverviewEntity;
  financial: DashboardFinancialEntity;
  operational: DashboardOperationalEntity;
  fleet: DashboardFleetEntity;
  charts: DashboardChartsEntity;
}

// Fase 40 -- gestao operacional da frota (dashboards executivos e
// operacionais). "value" em FleetVehicleRankingEntryEntity tem significado
// dependente do contexto (custo em R$ ou duracao em minutos), documentado
// em cada uso.
export interface FleetOverviewEntity {
  totalVehicles: number;
  activeVehicles: number;
  inactiveVehicles: number;
  suspendedVehicles: number;
  maintenanceVehicles: number;
  soldVehicles: number;
  activeTrips: number;
  // Fase 41 -- subconjunto de activeVehicles.
  vehiclesOnTrip: number;
  vehiclesAvailable: number;
  activeDrivers: number;
  openAlerts: number;
  // Fase 68 -- TripOccurrence (Fase 67).
  openOccurrences: number;
  criticalOpenOccurrences: number;
  resolvedOccurrences: number;
  cancelledOccurrences: number;
}

export interface FleetVehicleRankingEntryEntity {
  vehicleId: string;
  plate: string;
  value: number;
  count: number;
}

// Fase 68 -- GET /fleet-operations/occurrences.
export interface FleetOccurrenceTypeCountEntity {
  type: TripOccurrenceType;
  count: number;
}

export interface FleetOccurrenceSeverityCountEntity {
  severity: TripOccurrenceSeverity;
  count: number;
}

export interface FleetOccurrenceDriverRankingEntryEntity {
  driverId: string;
  driverName: string;
  count: number;
}

export interface FleetOccurrencesDashboardEntity {
  totalCount: number;
  openCount: number;
  criticalOpenCount: number;
  resolvedCount: number;
  cancelledCount: number;
  byType: FleetOccurrenceTypeCountEntity[];
  bySeverity: FleetOccurrenceSeverityCountEntity[];
  byVehicle: FleetVehicleRankingEntryEntity[];
  byDriver: FleetOccurrenceDriverRankingEntryEntity[];
  monthlyTrend: DashboardChartPointEntity[];
}

export interface FleetCostCategoryEntity {
  category: string;
  amount: number;
}

// Fase 41 -- fleetId=null representa veiculos sem frota atribuida.
export interface FleetCostFleetEntity {
  fleetId: string | null;
  fleetName: string;
  amount: number;
}

// Fase 41 -- so preenchido quando o filtro informa startDate E endDate.
export interface FleetCostsPreviousPeriodEntity {
  totalCost: number;
  deltaAmount: number;
  deltaPercent: number | null;
}

// Fase 85 -- custo/km da frota. distanceKm vem do pool de leituras reais de
// odometro (FuelSupply.odometerKm + VehicleMaintenance.odometerKm/
// completionOdometerKm), nunca TripMetrics.actualDistanceKm. available=false
// (com reason) quando nenhum veiculo do escopo tem >= 2 leituras de odometro.
export interface FleetCostPerKmEntity {
  available: boolean;
  reason: string | null;
  distanceKm: number | null;
  value: number | null;
  fuelCostPerKm: number | null;
  maintenanceCostPerKm: number | null;
  tireCostPerKm: number | null;
  tollCostPerKm: number | null;
  otherCostPerKm: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface FleetCostsEntity {
  totalCost: number;
  fuelCost: number;
  maintenanceCost: number;
  tireCost: number;
  tollCost: number;
  otherCost: number;
  costByCategory: FleetCostCategoryEntity[];
  topVehiclesByCost: FleetVehicleRankingEntryEntity[];
  averageCostPerVehicle: number | null;
  costByFleet: FleetCostFleetEntity[];
  monthlyTrend: DashboardChartPointEntity[];
  previousPeriod: FleetCostsPreviousPeriodEntity | null;
  costPerKm: FleetCostPerKmEntity;
  topVehiclesByCostPerKm: FleetVehicleRankingEntryEntity[];
}

// Fase 51 -- Gestao Financeira Operacional.
export interface FleetFinancialSummaryEntity {
  totalRevenue: number;
  totalExpenses: number;
  totalCost: number;
  totalAdvances: number;
  pendingExpenses: number;
  result: number;
  marginPercent: number | null;
}

export interface FleetFinancialTripRankingEntryEntity {
  tripId: string;
  label: string;
  value: number;
}

export interface FleetFinancialCustomerEntity {
  customerId: string | null;
  customerName: string;
  amount: number;
}

export interface FleetFinancialDriverEntity {
  driverId: string | null;
  driverName: string;
  expenses: number;
  advances: number;
}

export interface FleetFinancialDashboardEntity {
  summary: FleetFinancialSummaryEntity;
  monthlyRevenue: DashboardChartPointEntity[];
  monthlyExpenses: DashboardChartPointEntity[];
  monthlyResult: DashboardChartPointEntity[];
  topVehiclesByRevenue: FleetVehicleRankingEntryEntity[];
  topVehiclesByExpense: FleetVehicleRankingEntryEntity[];
  topExpenseCategories: FleetCostCategoryEntity[];
  topTripsByCost: FleetFinancialTripRankingEntryEntity[];
  bestTripsByResult: FleetFinancialTripRankingEntryEntity[];
  worstTripsByResult: FleetFinancialTripRankingEntryEntity[];
  revenueByFleet: FleetCostFleetEntity[];
  costByFleet: FleetCostFleetEntity[];
  revenueByCustomer: FleetFinancialCustomerEntity[];
  byDriver: FleetFinancialDriverEntity[];
}

export interface FleetMaintenanceTypeBreakdownEntity {
  type: VehicleMaintenanceType;
  count: number;
  cost: number;
}

export interface FleetMaintenancePriorityBreakdownEntity {
  priority: VehicleMaintenancePriority;
  count: number;
}

export interface FleetMaintenanceWorkshopBreakdownEntity {
  workshop: string | null;
  count: number;
  cost: number;
}

export interface FleetMaintenanceComponentBreakdownEntity {
  component: MaintenanceComponent | null;
  count: number;
  cost: number;
}

export interface FleetMaintenanceCostPerKmEntity {
  value: number | null;
  available: boolean;
  reason: string | null;
}

export interface FleetMaintenancePlanStatusEntity {
  planId: string;
  vehicleId: string;
  vehiclePlate: string;
  name: string;
  component: MaintenanceComponent;
  dueOdometerKm: number | null;
  dueDate: string | null;
  overdueByKm: number | null;
  overdueByDays: number | null;
}

export interface FleetMaintenanceDashboardEntity {
  totalCount: number;
  openCount: number;
  completedCount: number;
  cancelledCount: number;
  scheduledCount: number;
  lateWorkOrdersCount: number;
  preventiveCount: number;
  correctiveCount: number;
  totalCost: number;
  laborCostTotal: number;
  partsCostTotal: number;
  averageCostPerOccurrence: number | null;
  averageDurationHours: number | null;
  totalDowntimeMinutes: number | null;
  averageDowntimeMinutes: number | null;
  costPerKm: FleetMaintenanceCostPerKmEntity;
  overdueCount: number;
  dueSoonCount: number;
  byType: FleetMaintenanceTypeBreakdownEntity[];
  byPriority: FleetMaintenancePriorityBreakdownEntity[];
  byWorkshop: FleetMaintenanceWorkshopBreakdownEntity[];
  byComponent: FleetMaintenanceComponentBreakdownEntity[];
  topVehiclesByCost: FleetVehicleRankingEntryEntity[];
  bottomVehiclesByCost: FleetVehicleRankingEntryEntity[];
  // Fase 41 -- "value"/"count" = nº de manutencoes do veiculo.
  topVehiclesByCount: FleetVehicleRankingEntryEntity[];
  topVehiclesByDowntime: FleetVehicleRankingEntryEntity[];
  topComponentsByCost: FleetMaintenanceComponentBreakdownEntity[];
  topComponentsByCount: FleetMaintenanceComponentBreakdownEntity[];
  overdueMaintenances: FleetMaintenancePlanStatusEntity[];
  upcomingMaintenances: FleetMaintenancePlanStatusEntity[];
  maintenanceAlerts: FleetAlertEntity[];
  monthlyTrend: DashboardChartPointEntity[];
}

export interface FleetStopsTypeBreakdownEntity {
  type: TripStopType;
  count: number;
  totalDurationMinutes: number;
}

// Fase 44 -- ranking de paradas por motorista, ja ordenado pelo backend
// (totalDurationMinutes desc; empate: stopsCount desc, depois
// averageDurationMinutes desc, depois driverName asc).
export interface FleetStopsDriverRankingEntryEntity {
  driverId: string;
  driverName: string;
  stopsCount: number;
  totalDurationMinutes: number;
  averageDurationMinutes: number | null;
  maxDurationMinutes: number | null;
  minDurationMinutes: number | null;
  rankPosition: number;
}

// Fase 44 -- alerta de duracao longa: parada CONCLUIDA cuja duracao excedeu
// o limite configurado (padrao ou por tenant) para o seu tipo. Ja ordenado
// pelo backend por excessMinutes desc.
export interface FleetStopDurationAlertEntity {
  stopId: string;
  type: TripStopType;
  durationMinutes: number;
  thresholdMinutes: number;
  excessMinutes: number;
  vehicleId: string;
  vehiclePlate: string;
  driverId: string | null;
  driverName: string | null;
  tripId: string | null;
  tripReference: string | null;
  startedAt: string;
  endedAt: string;
  status: string;
}

export interface FleetStopsDashboardEntity {
  totalStops: number;
  totalDurationMinutes: number;
  averageDurationMinutes: number | null;
  maxDurationMinutes: number | null;
  minDurationMinutes: number | null;
  byType: FleetStopsTypeBreakdownEntity[];
  topVehiclesByDuration: FleetVehicleRankingEntryEntity[];
  driverRanking: FleetStopsDriverRankingEntryEntity[];
  durationAlerts: FleetStopDurationAlertEntity[];
  monthlyTrend: DashboardChartPointEntity[];
}

export interface FleetChecklistSummaryEntity {
  totalExecutions: number;
  completedExecutions: number;
  pendingExecutions: number;
  criticalNonConformityCount: number;
}

// Fase 41 -- KPIs operacionais (viagens/tempo/custo por viagem/utilizacao).
// "Km rodados"/"custo por km" NAO existem aqui: TripMetrics.actualDistanceKm
// nunca e escrito por nenhum service (ver docs/fleet-operations-dashboard.md).
export interface FleetOperationalIndicatorsEntity {
  completedTrips: number;
  inProgressTrips: number;
  cancelledTrips: number;
  plannedTrips: number;
  waitingDriverTrips: number;
  waitingDepartureTrips: number;
  pausedTrips: number;
  tripsWithoutDriver: number;
  tripsWithoutVehicle: number;
  delayedTrips: number;
  averageTripDurationMinutes: number | null;
  averageCostPerTrip: number | null;
  utilizationPercent: number | null;
  topVehiclesByTripCount: FleetVehicleRankingEntryEntity[];
}

// Fase 92 -- viagens vazias (Trip.loadStatus = EMPTY). NOTA: ao contrario do
// que o comentario acima (Fase 41) registrava, TripMetrics.actualDistanceKm/
// actualTotalCost SAO escritos desde a Fase 66 (TripsService, ao concluir a
// viagem com hodometro final) -- usados abaixo. Ver docs/trip-empty-runs.md.
export type EmptyTripReason =
  | 'NO_DELIVERIES_PLANNED'
  | 'ALL_DELIVERIES_CANCELLED'
  | 'DELIVERIES_INCOMPLETE'
  | 'COMPLETED_DELIVERIES_INCONSISTENT';

export interface EmptyTripEntity {
  id: string;
  status: TripStatus;
  plannedDeparture: string | null;
  actualDeparture: string | null;
  actualArrival: string | null;
  originName: string;
  destinationName: string;
  vehicleId: string | null;
  vehiclePlate: string | null;
  driverId: string | null;
  driverName: string | null;
  customerId: string | null;
  customerName: string | null;
  reason: EmptyTripReason;
  hasDeliveryStops: boolean;
  distanceKm: number | null;
  totalCost: number | null;
}

export interface FleetEmptyTripsReasonBreakdownEntity {
  reason: EmptyTripReason;
  count: number;
}

export interface FleetEmptyTripsSummaryEntity {
  totalDepartedTrips: number;
  loadedCount: number;
  emptyCount: number;
  unknownLoadStatusCount: number;
  emptyPercent: number | null;
  reasonBreakdown: FleetEmptyTripsReasonBreakdownEntity[];
  totalDistanceKm: number | null;
  totalCost: number | null;
  tripsWithDistanceCount: number;
  tripsWithCostCount: number;
}

// Fase 41 -- camada de alertas computada em memoria, nunca persistida (ver
// backend fleet-operations/entities/fleet-alert.entity.ts).
export type FleetAlertType =
  | 'COST_OUTLIER'
  | 'MAINTENANCE_OUTLIER'
  | 'STOP_TIME_OUTLIER'
  | 'STALLED_VEHICLE'
  | 'PENDING_CHECKLIST'
  // Fase 42 -- alertas de abastecimento.
  | 'FUEL_PRICE_OUTLIER'
  | 'CONSUMPTION_OUTLIER_HIGH'
  | 'CONSUMPTION_OUTLIER_LOW'
  | 'SUPPLY_VOLUME_OUTLIER'
  | 'ODOMETER_REGRESSION'
  // Fase 45 -- alertas de manutencao.
  | 'MAINTENANCE_OVERDUE'
  | 'MAINTENANCE_DUE_SOON'
  | 'HIGH_COST'
  | 'EXCESSIVE_BREAKDOWN'
  | 'EXCESSIVE_DOWNTIME'
  | 'CRITICAL_COMPONENT'
  | 'TIRE_NEAR_REPLACEMENT'
  | 'DOWNTIME_COST_OUTLIER'
  // Fase 62 -- visao operacional do veiculo (GET /vehicles/:id/overview).
  | 'VEHICLE_SUSPENDED'
  | 'VEHICLE_INACTIVE'
  | 'VEHICLE_DOCUMENT_EXPIRED'
  | 'VEHICLE_DOCUMENT_EXPIRING_SOON'
  | 'VEHICLE_DRIVER_UNAVAILABLE'
  | 'VEHICLE_TRIP_DATA_INCONSISTENCY'
  | 'VEHICLE_OPEN_MAINTENANCE'
  // Fase 63 -- granularidade dos alertas de manutencao do veiculo.
  | 'VEHICLE_MAINTENANCE_IN_PROGRESS'
  | 'VEHICLE_MAINTENANCE_SCHEDULED'
  | 'VEHICLE_MAINTENANCE_OVERDUE'
  | 'VEHICLE_UNAVAILABLE_MAINTENANCE'
  // Fase 64 -- pneu(s) do veiculo proximo(s) da troca.
  | 'VEHICLE_TIRE_NEAR_REPLACEMENT'
  // Fase 65 -- hodometro regressivo entre abastecimentos deste veiculo.
  | 'VEHICLE_FUEL_ODOMETER_REGRESSION';

export type FleetAlertSeverity = 'INFO' | 'ATTENTION' | 'CRITICAL';

export interface FleetAlertEntity {
  type: FleetAlertType;
  severity: FleetAlertSeverity;
  vehicleId: string;
  plate: string;
  message: string;
  value: number | null;
}

export interface FleetOperationsDashboardEntity {
  overview: FleetOverviewEntity;
  costs: FleetCostsEntity;
  fuel: FuelDashboardEntity;
  tires: TireDashboardEntity;
  maintenance: FleetMaintenanceDashboardEntity;
  stops: FleetStopsDashboardEntity;
  checklist: FleetChecklistSummaryEntity;
  operational: FleetOperationalIndicatorsEntity;
  alerts: FleetAlertEntity[];
}

// Fase 42 -- gestao avancada de abastecimento (GET /fleet-operations/fuel).
// Metodologia de consumo/custo-por-km reaproveitada INTEGRALMENTE de
// FuelSuppliesService.getDashboard() (distancia entre o primeiro e o
// ultimo odometro de um veiculo, litros abastecidos entre eles), so
// disponivel com >= 2 abastecimentos no escopo. Isto e "custo DE
// COMBUSTIVEL por km" -- distinto do "custo total da frota por km"
// (Fase 41, ainda indisponivel).
export interface FleetFuelSummaryEntity {
  totalCost: number;
  totalLiters: number;
  supplyCount: number;
  averagePricePerLiter: number | null;
  averageCostPerSupply: number | null;
  vehiclesSupplied: number;
  fleetsSupplied: number;
}

export interface FleetFuelConsumptionEntity {
  value: number | null;
  available: boolean;
  unit: 'km/l';
  reason: string | null;
}

export interface FleetFuelCostPerKmEntity {
  value: number | null;
  available: boolean;
  reason: string | null;
}

export interface FleetFuelVehicleBreakdownEntity {
  vehicleId: string;
  plate: string;
  fleetId: string | null;
  fleetName: string;
  supplyCount: number;
  liters: number;
  cost: number;
  averagePricePerLiter: number | null;
  consumption: FleetFuelConsumptionEntity;
  costPerKm: FleetFuelCostPerKmEntity;
  rankPosition: number;
  hasOdometerAnomaly: boolean;
}

export interface FleetFuelFleetBreakdownEntity {
  fleetId: string | null;
  fleetName: string;
  supplyCount: number;
  liters: number;
  cost: number;
  averagePricePerLiter: number | null;
  consumption: FleetFuelConsumptionEntity;
}

// best/worstConsumption so incluem veiculos com consumption.available=true.
export interface FleetFuelRankingsEntity {
  topCost: FleetVehicleRankingEntryEntity[];
  bottomCost: FleetVehicleRankingEntryEntity[];
  topVolume: FleetVehicleRankingEntryEntity[];
  bottomVolume: FleetVehicleRankingEntryEntity[];
  bestConsumption: FleetVehicleRankingEntryEntity[];
  worstConsumption: FleetVehicleRankingEntryEntity[];
  topPricePerLiter: FleetVehicleRankingEntryEntity[];
  topSupplyCount: FleetVehicleRankingEntryEntity[];
}

// So preenchido quando startDate E endDate sao ambos informados.
export interface FleetFuelPreviousPeriodEntity {
  currentCost: number;
  previousCost: number;
  costDeltaPercent: number | null;
  currentLiters: number;
  previousLiters: number;
  litersDeltaPercent: number | null;
  currentSupplyCount: number;
  previousSupplyCount: number;
  supplyCountDeltaPercent: number | null;
}

// Nivel de tanque ESTIMADO (nunca sensor real) -- ver
// docs/fleet-operations-dashboard.md, secao "Nivel de tanque (estimado)".
export interface FleetFuelTankLevelEntity {
  vehicleId: string;
  plate: string;
  capacityLiters: number | null;
  estimatedLevelLiters: number | null;
  percentage: number | null;
  available: boolean;
  reason: string | null;
  lastSupplyAt: string | null;
  kmSinceLastSupply: number | null;
}

export interface FleetFuelTankFleetAverageEntity {
  value: number | null;
  available: boolean;
  reason: string | null;
}

export interface FleetFuelAnalyticsEntity {
  summary: FleetFuelSummaryEntity;
  consumption: FleetFuelConsumptionEntity;
  costPerKm: FleetFuelCostPerKmEntity;
  monthlyTrendCost: DashboardChartPointEntity[];
  monthlyTrendLiters: DashboardChartPointEntity[];
  monthlyTrendSupplyCount: DashboardChartPointEntity[];
  vehicleBreakdown: FleetFuelVehicleBreakdownEntity[];
  fleetBreakdown: FleetFuelFleetBreakdownEntity[];
  rankings: FleetFuelRankingsEntity;
  alerts: FleetAlertEntity[];
  previousPeriod: FleetFuelPreviousPeriodEntity | null;
  tankLevels: FleetFuelTankLevelEntity[];
  tankFleetAverage: FleetFuelTankFleetAverageEntity;
}

// Composicao da frota (iteracao de redesign visual) -- foto do estado ATUAL
// da frota (ignora startDate/endDate), distinta de FleetOverviewEntity
// (dashboard consolidado, so contagem por status).
export interface FleetVehicleTypeBreakdownEntity {
  type: VehicleType;
  count: number;
}

export interface FleetVehicleStatusBreakdownEntity {
  status: VehicleStatus;
  count: number;
}

// Fase 62 -- distribuicao OWN/AGGREGATED/THIRD_PARTY.
export interface FleetVehicleOwnershipBreakdownEntity {
  ownershipType: VehicleOwnershipType;
  count: number;
}

export interface FleetVehicleFuelTypeBreakdownEntity {
  fuelType: VehicleFuelType | null;
  count: number;
}

export interface FleetVehicleFleetBreakdownEntity {
  fleetId: string | null;
  fleetName: string;
  count: number;
}

export interface FleetVehicleAverageMetricEntity {
  value: number | null;
  available: boolean;
  reason: string | null;
}

export interface FleetVehiclesOverviewEntity {
  totalVehicles: number;
  activeCount: number;
  inactiveCount: number;
  suspendedCount: number;
  maintenanceCount: number;
  soldCount: number;
  vehiclesOnTrip: number;
  vehiclesAvailable: number;
  byType: FleetVehicleTypeBreakdownEntity[];
  byStatus: FleetVehicleStatusBreakdownEntity[];
  byOwnershipType: FleetVehicleOwnershipBreakdownEntity[];
  byFuelType: FleetVehicleFuelTypeBreakdownEntity[];
  byFleet: FleetVehicleFleetBreakdownEntity[];
  averageAgeYears: FleetVehicleAverageMetricEntity;
  averageOdometerKm: FleetVehicleAverageMetricEntity;
  oldestVehicles: FleetVehicleRankingEntryEntity[];
  newestVehicles: FleetVehicleRankingEntryEntity[];
  topVehiclesByOdometer: FleetVehicleRankingEntryEntity[];
}

// Dashboard de pneus (iteracao de redesign visual). Distinto de
// TireDashboardEntity (GET /tires/dashboard, sem filtro, reaproveitado tal
// como esta no card "Pneus" do executivo).
export interface FleetTireStatusBreakdownEntity {
  status: TireStatus;
  count: number;
}

export interface FleetTireFleetBreakdownEntity {
  fleetId: string | null;
  fleetName: string;
  count: number;
  cost: number;
}

export interface FleetTirePositionBreakdownEntity {
  position: string;
  count: number;
}

export interface FleetTireWearEntity {
  tireId: string;
  fireNumber: string;
  vehiclePlate: string | null;
  position: string | null;
  wearPercentRemaining: number | null;
  currentTreadDepthMm: number | null;
  initialTreadDepthMm: number | null;
  available: boolean;
  reason: string | null;
}

export interface FleetTiresOverviewEntity {
  totalTires: number;
  newCount: number;
  inUseCount: number;
  stockCount: number;
  retreadedCount: number;
  scrappedCount: number;
  investedValue: number;
  retreadValue: number;
  averageLifespanKm: number | null;
  nearReplacementCount: number;
  averageCostPerTire: number | null;
  byStatus: FleetTireStatusBreakdownEntity[];
  byPosition: FleetTirePositionBreakdownEntity[];
  byFleet: FleetTireFleetBreakdownEntity[];
  monthlyTrendCost: DashboardChartPointEntity[];
  tireWear: FleetTireWearEntity[];
  topVehiclesByTireCost: FleetVehicleRankingEntryEntity[];
  tireAlerts: FleetAlertEntity[];
}

// Dashboard "Tempo parado e receita perdida". Tempo parado vem SOMENTE de
// TripStop; receita perdida e uma ESTIMATIVA (horas paradas x taxa de
// receita/hora do proprio veiculo, nunca R$/km).
export type DowntimeCategory = 'MAINTENANCE' | 'BREAKDOWN' | 'FUEL' | 'OTHER';

export interface FleetDowntimeCategoryEntity {
  category: DowntimeCategory;
  durationMinutes: number;
  count: number;
  estimatedLostRevenue: number | null;
}

export interface FleetRevenuePerHourEntity {
  value: number | null;
  available: boolean;
  reason: string | null;
  basedOnTripCount: number;
}

export interface FleetEstimatedLostRevenueEntity {
  value: number | null;
  available: boolean;
  reason: string | null;
}

export interface FleetVehicleDowntimeCostEntity {
  vehicleId: string;
  plate: string;
  totalDowntimeMinutes: number;
  stopCount: number;
  byCategory: FleetDowntimeCategoryEntity[];
  revenuePerHour: FleetRevenuePerHourEntity;
  estimatedLostRevenue: FleetEstimatedLostRevenueEntity;
}

export interface FleetDowntimeCostEntity {
  totalStops: number;
  totalDowntimeMinutes: number;
  totalEstimatedLostRevenue: FleetEstimatedLostRevenueEntity;
  byCategory: FleetDowntimeCategoryEntity[];
  vehicles: FleetVehicleDowntimeCostEntity[];
  topVehiclesByLostRevenue: FleetVehicleRankingEntryEntity[];
  topVehiclesByDowntimeMinutes: FleetVehicleRankingEntryEntity[];
  monthlyTrendDowntimeMinutes: DashboardChartPointEntity[];
  downtimeCostAlerts: FleetAlertEntity[];
}

// Dashboard "Composicao" -- uso de veiculo+carreta por viagem. Trailer nao
// tem campo de eixo proprio (eixo e atributo de AxleConfiguration, 1:1 com
// TripComposition); TripStop nao tem trailerId (tempo parado por carreta so
// cobre paradas com tripId); composicao com varias carretas (bitrem/
// rodotrem) atribui a duracao INTEIRA a cada carreta (nunca dividida). Sem
// estimativa de receita perdida por carreta (fora de escopo).
export interface FleetTrailerTypeBreakdownEntity {
  type: TrailerType;
  count: number;
}

export interface FleetAxleCategoryBreakdownEntity {
  billableCategory: string;
  totalAxles: number;
  count: number;
}

export interface FleetTrailerRankingEntryEntity {
  trailerId: string;
  plate: string;
  type: TrailerType;
  value: number;
  count: number;
}

export interface FleetTrailerDowntimeEntity {
  trailerId: string;
  plate: string;
  type: TrailerType;
  inUseMinutes: number;
  downtimeMinutes: number;
  tripCount: number;
}

export interface FleetCompositionsOverviewEntity {
  totalTrailers: number;
  activeCount: number;
  inactiveCount: number;
  trailersOnTrip: number;
  trailersAvailable: number;
  byType: FleetTrailerTypeBreakdownEntity[];
  axleCategoryBreakdown: FleetAxleCategoryBreakdownEntity[];
  topTrailersByTripCount: FleetTrailerRankingEntryEntity[];
  topTrailersByInUseMinutes: FleetTrailerRankingEntryEntity[];
  trailers: FleetTrailerDowntimeEntity[];
  monthlyTrendTripCount: DashboardChartPointEntity[];
}

// Fase 25 -- operacao da viagem (app do motorista), visibilidade
// administrativa somente leitura.
export interface TrackingPointEntity {
  id: string;
  tripId: string;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  headingDeg: number | null;
  recordedAt: string;
}

// Fase 43 -- tripId/driverId/latitude/longitude passaram a opcionais
// (parada administrativa sem viagem/motorista associado); status/source/
// notes/cancelledAt sao novos (espelha apps/api/src/trip-operations/
// entities/trip-stop.entity.ts). status e SEMPRE derivado pelo backend
// (endedAt/cancelledAt), nunca recalculado aqui.
export interface TripStopEntity {
  id: string;
  tripId: string | null;
  vehicleId: string;
  driverId: string | null;
  type: TripStopType;
  status: TripStopStatus;
  source: TripStopSource;
  latitude: number | null;
  longitude: number | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  locationLabel: string | null;
  notes: string | null;
  cancelledAt: string | null;
  syncStatus: SyncStatus;
  deviceEventId: string;
  createdAt: string;
  updatedAt: string;
}

// Fase 43 -- GET /trip-stops (listagem administrativa). Placa/motorista/
// referencia da viagem resolvidos em lote pelo backend (nunca 1 query por
// linha, ver TripStopsService.findAllPaginated).
export interface TripStopListItemEntity extends TripStopEntity {
  vehiclePlate: string;
  driverName: string | null;
  tripReference: string | null;
}

// Fase 67 -- espelha apps/api/src/trip-operations/entities/trip-occurrence.entity.ts.
// status e SEMPRE derivado pelo backend (resolvedAt/cancelledAt/inProgressAt), nunca recalculado aqui.
export interface TripOccurrenceEntity {
  id: string;
  tripId: string;
  // Fase 101 -- vinculo direto com a parada/entrega especifica (Fase 88).
  tripDeliveryStopId: string | null;
  driverShiftId: string | null;
  driverId: string | null;
  vehicleId: string | null;
  type: TripOccurrenceType;
  severity: TripOccurrenceSeverity;
  status: TripOccurrenceStatus;
  description: string;
  occurredAt: string;
  latitude: number | null;
  longitude: number | null;
  locationLabel: string | null;
  // Fase 101 -- marca a transicao para IN_PROGRESS.
  inProgressAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  cancelledAt: string | null;
  attachmentId: string | null;
  metadata: Record<string, unknown> | null;
  deviceEventId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Fase 101 -- espelha apps/api/src/trip-operations/entities/delivery-occurrence-list-item.entity.ts.
// Linha da listagem CROSS-TRIP de ocorrencias de entrega (GET /delivery-occurrences)
// -- mesmo padrao de DeliveryStopListItemEntity (Fase 99).
export interface DeliveryOccurrenceListItemEntity {
  id: string;
  tripId: string;
  tripStatus: TripStatus;
  tripOriginName: string;
  tripDestinationName: string;
  tripDeliveryStopId: string;
  tripDeliveryStopSequence: number;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  type: TripOccurrenceType;
  severity: TripOccurrenceSeverity;
  status: TripOccurrenceStatus;
  description: string;
  occurredAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolverName: string | null;
  cancelledAt: string | null;
  attachmentId: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
  updatedAt: string;
}

// Fase 101 -- espelha apps/api/src/trip-operations/entities/delivery-occurrences-dashboard.entity.ts.
export interface DeliveryOccurrenceTypeCountEntity {
  type: TripOccurrenceType;
  count: number;
}

export interface DeliveryOccurrenceSeverityCountEntity {
  severity: TripOccurrenceSeverity;
  count: number;
}

export interface DeliveryOccurrencesDashboardEntity {
  totalCount: number;
  openCount: number;
  inProgressCount: number;
  resolvedCount: number;
  cancelledCount: number;
  criticalOpenCount: number;
  bySeverity: DeliveryOccurrenceSeverityCountEntity[];
  byType: DeliveryOccurrenceTypeCountEntity[];
}

// Fase 88 -- espelha apps/api/src/trips/entities/trip-delivery-stop.entity.ts.
// Parada/entrega PLANEJADA (sequencia/cliente/local/status), distinta de
// TripStopEntity acima (parada OPERACIONAL do app do motorista).
export interface TripDeliveryStopEntity {
  id: string;
  tripId: string;
  sequence: number;
  customerId: string | null;
  customerName: string | null;
  locationId: string;
  locationName: string;
  locationAddress: string | null;
  status: TripDeliveryStopStatus;
  plannedArrival: string | null;
  // Fase 99 -- execucao real, sempre DERIVADA pelo backend da propria
  // transicao de status (nunca informada manualmente pelo frontend).
  actualArrival: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Fase 99 -- espelha apps/api/src/trips/entities/delivery-stop-list-item.entity.ts.
// Linha da listagem CROSS-TRIP de entregas (GET /delivery-stops) -- mesmos
// campos de TripDeliveryStopEntity acima, mais o contexto minimo da viagem
// (necessario numa visao que atravessa varias viagens ao mesmo tempo).
export interface DeliveryStopListItemEntity {
  id: string;
  tripId: string;
  tripStatus: TripStatus;
  tripOriginName: string;
  tripDestinationName: string;
  driverId: string | null;
  driverName: string | null;
  sequence: number;
  customerId: string | null;
  customerName: string | null;
  locationId: string;
  locationName: string;
  locationAddress: string | null;
  status: TripDeliveryStopStatus;
  plannedArrival: string | null;
  actualArrival: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Fase 99 -- espelha apps/api/src/trips/entities/delivery-stops-dashboard.entity.ts.
export interface DeliveryStopsDashboardEntity {
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  lateCount: number;
  totalCount: number;
}

// Fase 91 -- espelha apps/api/src/trips/entities/trip-eta.entity.ts. SEMPRE
// calculada sob demanda pelo backend -- nunca persistida, nunca inventada
// no frontend.
export interface TripDeliveryStopEtaEntity {
  stopId: string;
  sequence: number;
  status: TripDeliveryStopStatus;
  isNextStop: boolean;
  plannedArrival: string | null;
  estimatedArrival: string | null;
  source: TripEtaSource;
  basis: string | null;
  varianceSeconds: number | null;
  delayed: boolean | null;
  limitation: string | null;
}

export interface TripEtaResultEntity {
  tripId: string;
  generatedAt: string;
  nextStopId: string | null;
  tripPlannedArrival: string | null;
  tripEstimatedArrival: string | null;
  tripEstimatedArrivalSource: TripEtaSource;
  tripEstimatedArrivalBasis: string | null;
  tripVarianceSeconds: number | null;
  tripDelayed: boolean | null;
  stops: TripDeliveryStopEtaEntity[];
  limitations: string[];
}

// Fase 89 -- espelha apps/api/src/trips/entities/trip-routing-suggestion.entity.ts.
// distanceMeters/durationSeconds sempre null nesta instalacao (ver
// docs/trip-routing.md) -- nunca inventados no frontend.
export interface TripRoutingSuggestionItemEntity {
  stopId: string;
  currentSequence: number;
  suggestedSequence: number;
  customerName: string | null;
  locationName: string;
  locationAddress: string | null;
  plannedArrival: string | null;
  hasAddress: boolean;
}

export interface TripRoutingSuggestionEntity {
  tripId: string;
  generatedAt: string;
  changed: boolean;
  items: TripRoutingSuggestionItemEntity[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  routingProviderConfigured: boolean;
  limitations: string[];
}

export interface ApplyTripRoutingSuggestionEntity {
  applied: boolean;
  routeVersionId: string | null;
  routeVersionNumber: number | null;
}

// Fase 90 -- espelha apps/api/src/trips/entities/fleet-optimization.entity.ts.
// Um candidato e sempre um PAR (composicao de frota + motorista) -- "aplicar"
// e o PATCH /trips/:id ja existente (compositionId/driverId), nunca um
// endpoint novo.
export interface FleetOptimizationCandidateEntity {
  compositionId: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleType: VehicleType;
  vehicleCategory: string | null;
  cargoCapacityKg: number | null;
  totalAxles: number | null;
  driverId: string;
  driverName: string;
  driverCnhCategory: string;
  vehicleAvailable: boolean;
  driverAvailable: boolean;
  available: boolean;
  isCurrentSelection: boolean;
  hasCurrentDriverVehicleAssignment: boolean;
  score: number;
  rank: number | null;
  restrictions: string[];
  justification: string;
}

export interface FleetOptimizationResultEntity {
  tripId: string;
  generatedAt: string;
  candidates: FleetOptimizationCandidateEntity[];
  availableCompositionsCount: number;
  availableDriversCount: number;
  totalCompositionsConsidered: number;
  totalDriversConsidered: number;
  limitations: string[];
}

// Fase 67 -- espelha apps/api/src/trip-operations/entities/driver-shift.entity.ts.
// type reaproveita TripStopType (REST/MEAL/FUEL/MAINTENANCE/OTHER).
export interface ShiftBreakEntity {
  id: string;
  driverShiftId: string;
  type: TripStopType;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  reason: string | null;
}

export interface DriverShiftEntity {
  id: string;
  driverId: string;
  tripId: string | null;
  status: DriverShiftStatus;
  startedAt: string;
  endedAt: string | null;
  cancelledAt: string | null;
  durationMinutes: number | null;
  workedMinutes: number | null;
  breaks: ShiftBreakEntity[];
  createdAt: string;
  updatedAt: string;
}

// Fase 67 -- espelha apps/api/src/trips/entities/trip-timeline-event.entity.ts.
// Projecao/agregacao de eventos ja existentes -- nunca uma segunda fonte de
// verdade. occurredAt e sempre um timestamp real do registro de origem.
export interface TripTimelineEventEntity {
  id: string;
  origin: TripTimelineOrigin;
  type: string | null;
  label: string;
  description: string | null;
  severity: TripOccurrenceSeverity | null;
  occurredAt: string;
}

export interface AxleEventEntity {
  id: string;
  tripId: string;
  tollPlazaId: string | null;
  tollPlazaName: string | null;
  defaultAxles: number;
  declaredAxles: number;
  suspendedAxles: number;
  source: AxleEventSource;
  startedAt: string;
  endedAt: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
}

// Fase 26 -- roteirizacao geografica (RoutePlan/RoutePlanToll).
export interface RoutePlanTollEntity {
  id: string;
  tollPlazaId: string | null;
  sequence: number;
  name: string;
  latitude: number;
  longitude: number;
  distanceFromOriginMeters: number;
  estimatedAmount: number | null;
  currency: string;
  axleCountUsed: number | null;
  matchStatus: TollMatchStatus;
  matchConfidence: number | null;
  source: string;
}

export interface RoutePlanEntity {
  id: string;
  tripId: string;
  originLabel: string;
  destinationLabel: string;
  originLatitude: number;
  originLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  distanceMeters: number;
  durationSeconds: number;
  totalTollAmount: number | null;
  tollEstimateSource: RouteTollEstimateSource;
  currency: string;
  axleCountUsed: number | null;
  reason: RouteVersionReason;
  provider: string;
  providerRouteId: string | null;
  isCurrent: boolean;
  tolls: RoutePlanTollEntity[];
  createdAt: string;
  updatedAt: string;
}

export interface RouteComparisonEntity {
  distanceMetersDiff: number;
  durationSecondsDiff: number;
  tollCountDiff: number;
  totalTollAmountDiff: number | null;
}

export interface RoutePlanComparisonEntity {
  previous: RoutePlanEntity | null;
  next: RoutePlanEntity;
  difference: RouteComparisonEntity | null;
}

// Fase 38 -- checklist operacional. Ver docs/checklist-module.md.
export interface ChecklistItemEntity {
  id: string;
  sectionId: string;
  code: string;
  label: string;
  description: string | null;
  type: ChecklistItemType;
  required: boolean;
  order: number;
  requiresObservation: boolean;
  requiresPhoto: boolean;
  critical: boolean;
  options: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistSectionEntity {
  id: string;
  templateId: string;
  title: string;
  description: string | null;
  order: number;
  items: ChecklistItemEntity[];
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistTemplateEntity {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  type: ChecklistType;
  vehicleType: VehicleType | null;
  trailerType: TrailerType | null;
  version: number;
  status: ChecklistTemplateStatus;
  previousVersionId: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  sections: ChecklistSectionEntity[];
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistEvidenceEntity {
  id: string;
  executionId: string;
  answerId: string | null;
  type: ChecklistEvidenceType;
  attachmentId: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  capturedAt: string;
  createdAt: string;
}

export interface ChecklistAnswerEntity {
  id: string;
  executionId: string;
  itemId: string;
  booleanValue: boolean | null;
  textValue: string | null;
  numberValue: number | null;
  selectedValue: string | null;
  evidence: ChecklistEvidenceEntity[];
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistExecutionEntity {
  id: string;
  tenantId: string;
  templateId: string;
  templateVersion: number;
  tripId: string | null;
  driverId: string | null;
  vehicleId: string | null;
  trailerId: string | null;
  status: ChecklistExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  odometerKm: number | null;
  inspectionLocation: string | null;
  responsibleName: string | null;
  hasCriticalNonConformity: boolean;
  answers: ChecklistAnswerEntity[];
  evidence: ChecklistEvidenceEntity[];
  createdAt: string;
  updatedAt: string;
}

// Fase 52 -- Fiscal/Documental. status=VALID significa apenas "estrutura/
// conteudo basico reconhecido pelo sistema" -- NUNCA validacao fiscal
// oficial perante a SEFAZ.
export interface FiscalDocumentEntity {
  id: string;
  tenantId: string;
  documentType: FiscalDocumentType;
  documentNumber: string | null;
  accessKey: string | null;
  series: string | null;
  issueDate: string | null;
  senderName: string | null;
  senderDocument: string | null;
  recipientName: string | null;
  recipientDocument: string | null;
  status: FiscalDocumentStatus;
  source: FiscalDocumentSource;
  attachmentId: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  metadata: Record<string, unknown> | null;
  tripId: string | null;
  tripLabel: string | null;
  // Fase 100 -- vinculo direto com a parada/entrega especifica (Fase 88).
  tripDeliveryStopId: string | null;
  tripDeliveryStopSequence: number | null;
  // Fase 102 -- vinculo direto com a ocorrencia especifica (Fase 67/101).
  tripOccurrenceId: string | null;
  tripOccurrenceType: TripOccurrenceType | null;
  tripOccurrenceSeverity: TripOccurrenceSeverity | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  driverId: string | null;
  driverName: string | null;
  customerId: string | null;
  customerName: string | null;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
  // Fase 54 -- motivos OBJETIVOS de inconsistencia estrutural (chave/tipo/
  // campos/data/duplicidade/vinculo). Lista vazia = nenhum problema
  // estrutural identificado. NUNCA validacao fiscal/SEFAZ.
  validationIssues: FiscalIssueCode[];
  // Fase 55 -- so calculado em GET /fiscal/documents/:id (detalhe).
  // relatedDocumentsAvailable=false quando o tipo nao participa de
  // manifesto ou faltam dados (chave/manifesto/viagem) para derivar.
  relatedDocuments: RelatedFiscalDocumentEntity[];
  relatedDocumentsAvailable: boolean;
  // Fase 56 -- DRIVER (Driver App) ou ADMIN (fluxo administrativo), derivado
  // do role de quem criou o documento -- nunca uma coluna nova.
  origin: FiscalDocumentOrigin;
}

export type FiscalDocumentOrigin = 'DRIVER' | 'ADMIN';

// Fase 55 -- projecao leve de um documento relacionado (nunca a entity
// completa/recursiva).
export interface RelatedFiscalDocumentEntity {
  id: string;
  documentType: FiscalDocumentType;
  documentNumber: string | null;
  accessKey: string | null;
  status: FiscalDocumentStatus;
  fileName: string | null;
  tripId: string | null;
}

export interface FiscalDocumentTypeCountEntity {
  type: FiscalDocumentType;
  count: number;
}

export interface FiscalDocumentStatusCountEntity {
  status: FiscalDocumentStatus;
  count: number;
}

// Fase 54 -- contagem de documentos por motivo objetivo de inconsistencia.
export interface FiscalIssueCountEntity {
  code: FiscalIssueCode;
  count: number;
}

export interface FiscalDashboardEntity {
  totalDocuments: number;
  cteCount: number;
  mdfeCount: number;
  nfeCount: number;
  ciotCount: number;
  pendingCount: number;
  validCount: number;
  invalidCount: number;
  cancelledCount: number;
  unlinkedCount: number;
  linkedCount: number;
  monthlyEvolution: DashboardChartPointEntity[];
  byType: FiscalDocumentTypeCountEntity[];
  byStatus: FiscalDocumentStatusCountEntity[];
  problematicDocuments: FiscalDocumentEntity[];
  alerts: FiscalIssueCountEntity[];
  // Fase 55 -- contagem de VIAGENS (nao documentos) por situacao documental;
  // so conta viagens com pelo menos 1 documento no escopo do filtro.
  tripsWithDocumentsOk: number;
  tripsWithDocumentsAttention: number;
  tripsWithDocumentsProblematic: number;
  operationalDivergenceCount: number;
  problemsMonthlyEvolution: DashboardChartPointEntity[];
  // Fase 56 -- comprovante de entrega (DELIVERY_PROOF). Mesmo universo de
  // viagens de tripsWithDocuments* -- nunca todas as viagens do tenant.
  tripsWithDeliveryProof: number;
  tripsWithoutDeliveryProof: number;
  deliveryProofCoveragePercent: number | null;
  deliveryProofCoverageAvailable: boolean;
  deliveryProofPendingCount: number;
  deliveryProofProblematicCount: number;
  deliveryProofMonthlyEvolution: DashboardChartPointEntity[];
  // Fase 57 -- CIOT (contagem total ja existia em ciotCount/byType).
  ciotLinkedCount: number;
  ciotUnlinkedCount: number;
  ciotPendingCount: number;
  ciotInvalidCount: number;
  ciotProblematicCount: number;
  ciotOperationalDivergenceCount: number;
  ciotMonthlyEvolution: DashboardChartPointEntity[];
  // Fase 58 -- MDF-e <-> CT-e/NF-e, derivado exclusivamente de chNFe/chCTe
  // ja declarados no XML.
  relatedDocumentsCount: number;
}

// Fase 53 -- situacao documental consolidada de UMA viagem.
// Fase 54 -- structurallyValidCount/problematicCount/problematicDocuments/
// completenessPercent(sempre null)/completenessAvailable(sempre false).
export interface TripDocumentStatusEntity {
  tripId: string;
  totalDocuments: number;
  pendingCount: number;
  validCount: number;
  invalidCount: number;
  cancelledCount: number;
  presentTypes: FiscalDocumentType[];
  absentTypes: FiscalDocumentType[];
  structurallyValidCount: number;
  problematicCount: number;
  problematicDocuments: FiscalDocumentEntity[];
  completenessPercent: number | null;
  completenessAvailable: boolean;
  // Fase 55 -- situacao documental (OK/ATTENTION/PROBLEMATIC/UNAVAILABLE).
  // NUNCA "conformidade SEFAZ" -- classificacao interna sobre coerencia dos
  // dados existentes.
  complianceStatus: TripDocumentComplianceStatus;
  matrix: TripDocumentMatrixRowEntity[];
  // Documentos SEM vinculo a nenhuma viagem, mas com evidencia objetiva
  // (veiculo/motorista/cliente identico ao desta viagem) -- nunca matching
  // agressivo.
  unlinkedCandidates: FiscalDocumentEntity[];
  // Fase 56 -- status do comprovante de entrega, sempre derivado da linha
  // DELIVERY_PROOF de `matrix` (nunca uma maquina de estados nova).
  deliveryProofStatus: DeliveryProofStatus;
}

// Fase 55 -- 1 linha por tipo do catalogo FiscalDocumentType (mesmo com
// totalCount=0 -- "ausente" nunca vira erro).
export interface TripDocumentMatrixRowEntity {
  documentType: FiscalDocumentType;
  totalCount: number;
  present: boolean;
  structurallyValidCount: number;
  pendingCount: number;
  invalidCount: number;
  cancelledCount: number;
  problematicCount: number;
  duplicateCandidateCount: number;
  withIssuesCount: number;
  unlinkedRelatedCount: number;
  // Fase 58 -- MDF-e <-> CT-e/NF-e, derivado exclusivamente de chNFe/chCTe
  // ja declarados no XML.
  relatedCount: number;
}

// ============================================================================
// Fase 59 -- Gestao de Fretes, Contratos e Tabelas de Frete.
// ============================================================================

export interface ContractEntity {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string | null;
  code: string;
  description: string | null;
  status: ContractStatus;
  startDate: string;
  endDate: string | null;
  isExpired: boolean;
  notes: string | null;
  commercialTerms: string | null;
  freightTablesCount: number;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Fase 98 -- Renovacao de Contratos.
// ============================================================================

export interface ContractRenewalEntity {
  id: string;
  tenantId: string;
  previousContractId: string;
  previousContractCode: string | null;
  customerId: string;
  customerName: string | null;
  newContractId: string | null;
  newContractCode: string | null;
  status: ContractRenewalStatus;
  previousEndDate: string | null;
  newStartDate: string | null;
  newEndDate: string | null;
  notes: string | null;
  initiatedBy: string;
  initiatorName: string | null;
  initiatedAt: string;
  completedBy: string | null;
  completerName: string | null;
  completedAt: string | null;
  cancelledBy: string | null;
  cancellerName: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ContractExpiryStatus = 'EXPIRING_SOON' | 'EXPIRED';

export interface RenewalExpiringContractEntity {
  contractId: string;
  code: string;
  customerId: string;
  customerName: string;
  endDate: string;
  daysUntilExpiry: number;
  expiryStatus: ContractExpiryStatus;
  hasActiveRenewal: boolean;
  activeRenewalId: string | null;
}

export interface ContractRenewalSummaryEntity {
  expiringCount: number;
  expiredCount: number;
  pendingRenewalsCount: number;
}

export interface FreightTableEntity {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string | null;
  contractId: string | null;
  contractCode: string | null;
  name: string;
  code: string;
  status: FreightTableStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
  notes: string | null;
  rulesCount: number;
  activeRulesCount: number;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FreightRuleFeeEntity {
  label: string;
  amount: number;
}

export interface FreightRuleEntity {
  id: string;
  tenantId: string;
  freightTableId: string;
  version: number;
  status: FreightRuleStatus;
  previousVersionId: string | null;
  nextVersionId: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  originLocationId: string | null;
  destinationLocationId: string | null;
  originRegion: string | null;
  destinationRegion: string | null;
  cargoType: string | null;
  vehicleType: VehicleType | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  minCubageM3: number | null;
  maxCubageM3: number | null;
  priority: number;
  baseAmount: number | null;
  perKmAmount: number | null;
  perTonAmount: number | null;
  minimumAmount: number | null;
  tollAmount: number | null;
  riskAdditionalAmount: number | null;
  nightAdditionalAmount: number | null;
  dailyRateAmount: number | null;
  demurrageAmount: number | null;
  otherFees: FreightRuleFeeEntity[] | null;
  notes: string | null;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

// Resultado da simulacao (nunca persistido). available=false = nao existe
// tabela/regra aplicavel -- nunca um preco zero mascarando a ausencia.
export interface FreightQuoteEntity {
  available: boolean;
  reason: string | null;
  freightTableId: string | null;
  freightTableName: string | null;
  ruleId: string | null;
  ruleVersion: number | null;
  baseAmount: number | null;
  additionsAmount: number | null;
  tollAmount: number | null;
  feesAmount: number | null;
  totalAmount: number | null;
}

export interface TripFreightEntity {
  id: string;
  tenantId: string;
  tripId: string;
  contractId: string | null;
  contractCode: string | null;
  freightTableId: string | null;
  freightTableName: string | null;
  freightRuleId: string | null;
  freightRuleVersion: number | null;
  calculationInput: Record<string, unknown>;
  baseAmount: number | null;
  additionsAmount: number | null;
  tollAmount: number | null;
  feesAmount: number | null;
  estimatedAmount: number | null;
  contractedAmount: number | null;
  finalAmount: number | null;
  revenueId: string | null;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

// Fase 94 -- Cotacoes: solicitacao de transporte de um cliente, ANTES de
// existir uma Trip. Valor/breakdown sao sempre um snapshot (nunca
// recalculados retroativamente quando a FreightTable/FreightRule de
// origem muda depois).
export interface QuotationEntity {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string | null;
  customerContactId: string | null;
  customerContactName: string | null;
  originLocationId: string;
  originLocationName: string | null;
  destinationLocationId: string;
  destinationLocationName: string | null;
  cargoType: string | null;
  weightKg: number | null;
  cubageM3: number | null;
  vehicleType: VehicleType | null;
  conditions: string | null;
  status: QuotationStatus;
  validUntil: string;
  expired: boolean;
  amountSource: QuotationAmountSource;
  amount: number;
  freightTableId: string | null;
  freightTableName: string | null;
  freightRuleId: string | null;
  freightRuleVersion: number | null;
  baseAmount: number | null;
  additionsAmount: number | null;
  tollAmount: number | null;
  feesAmount: number | null;
  calculatedAmount: number | null;
  calculationInput: Record<string, unknown> | null;
  convertedTripId: string | null;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

// Fase 95 -- Propostas: documento comercial formal ao cliente, distinto da
// Quotation (Fase 94). Valor/condicoes sao sempre um snapshot (nunca
// recalculados depois de emitida).
export interface ProposalEntity {
  id: string;
  tenantId: string;
  number: number;
  customerId: string;
  customerName: string | null;
  quotationId: string | null;
  quotationOriginLocationName: string | null;
  quotationDestinationLocationName: string | null;
  status: ProposalStatus;
  totalAmount: number;
  commercialConditions: string | null;
  notes: string | null;
  issuedAt: string;
  validUntil: string;
  expired: boolean;
  decidedAt: string | null;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

// Fase 96 -- Pipeline Comercial. Estagio CONFIGURAVEL POR TENANT (nao e um
// enum fixo como QuotationStatus/ProposalStatus).
export interface PipelineStageEntity {
  id: string;
  tenantId: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineOpportunityEntity {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string | null;
  quotationId: string | null;
  proposalId: string | null;
  proposalNumber: number | null;
  stageId: string;
  stageName: string | null;
  stageIsWon: boolean | null;
  stageIsLost: boolean | null;
  title: string | null;
  estimatedValue: number | null;
  notes: string | null;
  lostReason: string | null;
  wonAt: string | null;
  lostAt: string | null;
  createdBy: string;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineBoardColumnEntity {
  stage: PipelineStageEntity;
  totalCount: number;
  totalEstimatedValue: number;
  opportunities: PipelineOpportunityEntity[];
}

export interface PipelineBoardEntity {
  columns: PipelineBoardColumnEntity[];
}

export interface PipelineDashboardStageBreakdownEntity {
  stageId: string;
  stageName: string;
  isWon: boolean;
  isLost: boolean;
  count: number;
  estimatedValue: number;
}

export interface PipelineDashboardEntity {
  openCount: number;
  openEstimatedValue: number;
  wonCount: number;
  wonEstimatedValue: number;
  lostCount: number;
  lostEstimatedValue: number;
  conversionRate: number;
  byStage: PipelineDashboardStageBreakdownEntity[];
}

// Fase 97 -- Rentabilidade por Cliente. Sempre calculado ao vivo (nunca
// persistido); revenue = TripRevenue.amount, cost = TripExpense(APPROVED) +
// FuelSupply + TollTransaction (mesma metodologia de
// TripSettlementsService.getFinancialDashboard).
export interface CustomerProfitabilityEntity {
  customerId: string;
  customerName: string;
  tripsCount: number;
  revenue: number;
  cost: number;
  result: number;
  marginPercent: number | null;
}

export interface CustomerProfitabilitySummaryEntity {
  totalRevenue: number;
  totalCost: number;
  totalResult: number;
  marginPercent: number | null;
  tripsCount: number;
  customersCount: number;
}

export interface CustomerProfitabilityDashboardEntity {
  summary: CustomerProfitabilitySummaryEntity;
  topByResult: CustomerProfitabilityEntity[];
  topByMargin: CustomerProfitabilityEntity[];
}

// Reaproveita o financeiro da viagem (Fase 51) -- nenhum custo recalculado
// aqui. "Custo previsto" nao existe como conceito no projeto: a margem
// prevista compara o valor CONTRATADO contra o custo JA REALIZADO.
export interface TripProfitabilityEntity {
  tripId: string;
  contractedAmount: number | null;
  contractedAmountAvailable: boolean;
  realizedRevenue: number;
  realizedCost: number;
  projectedMargin: number | null;
  projectedResult: number | null;
  realResult: number;
  resultDifference: number | null;
}

export interface FreightTopCustomerEntity {
  customerId: string;
  customerName: string;
  totalAmount: number;
  freightsCount: number;
}

export interface FreightTopRouteEntity {
  originName: string | null;
  destinationName: string | null;
  totalAmount: number;
  freightsCount: number;
}

export interface FreightTopTableEntity {
  freightTableId: string;
  freightTableName: string;
  totalAmount: number;
  freightsCount: number;
}

export interface ExpiringContractEntity {
  id: string;
  code: string;
  customerName: string;
  endDate: string;
}

export interface FreightDashboardEntity {
  contractedAmountTotal: number;
  freightsCount: number;
  averageTicket: number | null;
  realizedRevenueTotal: number;
  realizedCostTotal: number;
  projectedMarginTotal: number;
  realResultTotal: number;
  resultDifferenceTotal: number;
  topCustomers: FreightTopCustomerEntity[];
  topRoutes: FreightTopRouteEntity[];
  topFreightTables: FreightTopTableEntity[];
  contractsExpiringSoon: ExpiringContractEntity[];
  tripsWithoutApplicableRuleCount: number;
}

// ============================================================================
// Fase 60 -- Faturamento Operacional e Conciliacao Comercial.
// ============================================================================

export interface TripBillingEntryEntity {
  id: string;
  amount: number;
  revenueId: string;
  notes: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
}

// persisted=false = preview ao vivo (nenhum faturamento iniciado ainda) --
// nunca um 404, mesmo espirito de TripSettlementEntity (Fase 51).
export interface TripBillingEntity {
  id: string | null;
  tenantId: string;
  tripId: string;
  tripLabel: string | null;
  customerId: string | null;
  customerName: string | null;
  persisted: boolean;
  status: TripBillingStatus;
  contractedAmount: number | null;
  calculatedAmount: number | null;
  billableAmount: number | null;
  invoicedAmount: number;
  receivedAmount: number;
  balance: number | null;
  notes: string | null;
  entries: TripBillingEntryEntity[];
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellerName: string | null;
  createdBy: string | null;
  creatorName: string | null;
  updatedBy: string | null;
  updaterName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BillingTopCustomerEntity {
  customerId: string;
  customerName: string;
  totalInvoiced: number;
  billingsCount: number;
}

export interface BillingTopFleetEntity {
  fleetId: string | null;
  fleetName: string;
  totalInvoiced: number;
  billingsCount: number;
}

export interface BillingTopVehicleEntity {
  vehicleId: string;
  plate: string;
  totalInvoiced: number;
  billingsCount: number;
}

export interface OperationalBillingDashboardEntity {
  totalBillable: number;
  totalInvoiced: number;
  totalReceived: number;
  balanceToInvoice: number;
  readyForInvoicingCount: number;
  partiallyInvoicedCount: number;
  pendingCount: number;
  monthlyEvolution: DashboardChartPointEntity[];
  topCustomers: BillingTopCustomerEntity[];
  topFleets: BillingTopFleetEntity[];
  topVehicles: BillingTopVehicleEntity[];
  commercialMargin: number;
}

// Fase 69 -- Centro de Alertas e Notificacoes. Nunca duplica dados da
// origem: entityType/entityId apontam para ela, metadata so o minimo para
// navegacao (ex: {tripId}/{vehicleId}).
export interface NotificationEntity {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: AlertSeverity;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface UnreadNotificationCountEntity {
  total: number;
  critical: number;
}

// Fase 72 -- Contas a Receber. Gerado a partir de um TripBilling
// existente (Fase 60) -- nunca um sistema financeiro paralelo. status e
// sempre o EFETIVO (pode ser 'OVERDUE', que nunca e persistido no
// backend -- ver docs/receivables.md).
export interface ReceivablePaymentEntity {
  id: string;
  receivableId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: ReceivablePaymentMethod;
  reference: string | null;
  notes: string | null;
  /** Fase 79 -- nulo apenas para recebimentos registrados antes desta fase. */
  financialAccountId: string | null;
  financialAccountName: string | null;
  financialTransactionId: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
}

export interface ReceivableEntity {
  id: string;
  customerId: string | null;
  customerName: string | null;
  tripId: string;
  tripLabel: string | null;
  billingId: string;
  description: string;
  originalAmount: number;
  receivedAmount: number;
  balance: number;
  issueDate: string;
  dueDate: string;
  status: ReceivableEffectiveStatus;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellerName: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
  updatedAt: string;
  payments?: ReceivablePaymentEntity[];
}

export interface ReceivablesDashboardSummaryEntity {
  totalInvoiced: number;
  totalReceived: number;
  totalOpen: number;
  totalOverdue: number;
  totalUpcoming: number;
  openCount: number;
  overdueCount: number;
  paidCount: number;
  cancelledCount: number;
}

export interface ReceivablesAgingBucketEntity {
  label: string;
  amount: number;
  count: number;
}

export interface ReceivablesByCustomerEntity {
  customerId: string | null;
  customerName: string;
  totalInvoiced: number;
  totalReceived: number;
  balance: number;
  overdueAmount: number;
}

export interface ReceivablesDashboardEntity {
  summary: ReceivablesDashboardSummaryEntity;
  aging: ReceivablesAgingBucketEntity[];
  byCustomer: ReceivablesByCustomerEntity[];
}

// Fase 73 -- Contas a Pagar. Gerado a partir de uma TripExpense existente
// (Fase 16/51) -- nunca um sistema de despesas paralelo. status e sempre
// o EFETIVO (pode ser 'OVERDUE', nunca persistido -- ver docs/payables.md).
export interface PayablePaymentEntity {
  id: string;
  payableId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: ExpensePaymentMethod;
  reference: string | null;
  notes: string | null;
  /** Fase 79 -- nulo apenas para pagamentos registrados antes desta fase. */
  financialAccountId: string | null;
  financialAccountName: string | null;
  financialTransactionId: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
}

export interface PayableEntity {
  id: string;
  tripId: string;
  tripLabel: string | null;
  expenseId: string;
  supplierName: string | null;
  category: ExpenseCategory;
  description: string;
  originalAmount: number;
  paidAmount: number;
  balance: number;
  issueDate: string;
  dueDate: string;
  status: PayableEffectiveStatus;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellerName: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
  updatedAt: string;
  payments?: PayablePaymentEntity[];
}

export interface PayablesDashboardSummaryEntity {
  totalPayable: number;
  totalPaid: number;
  totalOpen: number;
  totalOverdue: number;
  totalUpcoming: number;
  openCount: number;
  overdueCount: number;
  paidCount: number;
  cancelledCount: number;
}

export interface PayablesAgingBucketEntity {
  label: string;
  amount: number;
  count: number;
}

export interface PayablesByCategoryEntity {
  category: ExpenseCategory;
  totalPayable: number;
  totalPaid: number;
  balance: number;
}

export interface PayablesDashboardEntity {
  summary: PayablesDashboardSummaryEntity;
  aging: PayablesAgingBucketEntity[];
  byCategory: PayablesByCategoryEntity[];
}

// Fase 74 -- Fluxo de Caixa consolidado. PROJECAO sobre Receivable/
// ReceivablePayment/Payable/PayablePayment ja existentes -- nunca um
// saldo bancario real (sem conta bancaria/conciliacao no projeto, ver
// docs/cash-flow.md).
export interface CashFlowSummaryEntity {
  totalReceived: number;
  totalPaid: number;
  totalReceivableOpen: number;
  totalPayableOpen: number;
  totalReceivableOverdue: number;
  totalPayableOverdue: number;
  projectedNetBalance: number;
  receivedCount: number;
  paidCount: number;
}

export interface CashFlowMonthlyPointEntity {
  period: string;
  received: number;
  paid: number;
  net: number;
  receivableDue: number;
  payableDue: number;
  receivableOverdue: number;
  payableOverdue: number;
}

export interface CashFlowEntity {
  summary: CashFlowSummaryEntity;
  monthly: CashFlowMonthlyPointEntity[];
  topReceivableCustomers: ReceivablesByCustomerEntity[];
  topPayableCategories: PayablesByCategoryEntity[];
}

// Fase 75 -- Conciliacao Financeira. Nao sao enums Prisma (nunca
// persistidos, ver docs/finance-reconciliation.md) -- unions locais, mesmo
// espirito de ReceivableEffectiveStatus/PayableEffectiveStatus.
export type ReconciliationIssueType =
  | 'RECEIVABLE_WITHOUT_BILLING'
  | 'BILLING_WITHOUT_RECEIVABLE'
  | 'RECEIVABLE_BALANCE_INCONSISTENT'
  | 'RECEIVABLE_PAYMENT_EXCEEDS_INVOICED'
  | 'PAYABLE_WITHOUT_APPROVED_EXPENSE'
  | 'PAYABLE_BALANCE_INCONSISTENT'
  | 'PAYABLE_PAYMENT_EXCEEDS_EXPENSE'
  | 'DUPLICATE_RECEIVABLE'
  | 'DUPLICATE_PAYABLE'
  | 'TRIP_EXPENSE_WITHOUT_PAYABLE'
  | 'TRIP_BILLING_WITHOUT_RECEIVABLE';

export type ReconciliationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type ReconciliationEntityType = 'Receivable' | 'Payable' | 'TripBilling' | 'TripExpense';

export interface FinanceReconciliationIssueEntity {
  type: ReconciliationIssueType;
  severity: ReconciliationSeverity;
  entityType: ReconciliationEntityType;
  entityId: string;
  tripId: string | null;
  tripLabel: string | null;
  customerId: string | null;
  amount: number | null;
  expectedAmount: number | null;
  actualAmount: number | null;
  description: string;
  detectedAt: string;
}

export interface FinanceReconciliationSummaryEntity {
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  totalReceivableIssues: number;
  totalPayableIssues: number;
  totalBillingIssues: number;
  totalExpenseIssues: number;
}

export interface ReconciliationByTypeEntity {
  type: ReconciliationIssueType;
  severity: ReconciliationSeverity;
  count: number;
}

export interface ReconciliationBySeverityEntity {
  severity: ReconciliationSeverity;
  count: number;
}

export interface PaginatedFinanceReconciliationIssuesEntity {
  items: FinanceReconciliationIssueEntity[];
  meta: PaginationMeta;
}

export interface FinanceReconciliationEntity {
  summary: FinanceReconciliationSummaryEntity;
  byType: ReconciliationByTypeEntity[];
  bySeverity: ReconciliationBySeverityEntity[];
  issues: PaginatedFinanceReconciliationIssuesEntity;
}

// Fase 76 -- Fechamento Financeiro/Periodos. Camada de CONTROLE sobre os
// ledgers ja existentes (Receivable/Payable) -- nunca um ledger novo.
export interface FinancialPeriodSummaryEntity {
  totalReceived: number;
  totalPaid: number;
  receivableOpen: number;
  payableOpen: number;
  criticalReconciliationIssues: number;
}

export interface FinancialPeriodEntity {
  id: string;
  year: number;
  month: number;
  status: FinancialPeriodStatus;
  openedAt: string;
  closedAt: string | null;
  openedBy: string;
  openerName: string | null;
  closedBy: string | null;
  closerName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Presente apenas no detalhe (GET /finance/periods/:id). */
  summary?: FinancialPeriodSummaryEntity;
  /**
   * Presente apenas no detalhe (GET /finance/periods/:id). Historico de
   * auditoria do PROPRIO periodo (financial_period.created/closed) --
   * Fase 77, unico vinculo estruturalmente seguro com AuditLog.
   */
  auditHistory?: AuditLogEntity[];
}

// Fase 78 -- Contas Financeiras, Saldos e Movimentacoes Manuais. Espelha
// apps/api/src/finance-accounts/entities/*.ts. currentBalance e SEMPRE
// calculado (initialBalance + creditos - debitos), nunca uma coluna real.
export interface FinancialAccountEntity {
  id: string;
  name: string;
  type: FinancialAccountType;
  initialBalance: number;
  currentBalance: number;
  bankName: string | null;
  bankCode: string | null;
  accountNumberMasked: string | null;
  isActive: boolean;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialTransactionEntity {
  id: string;
  accountId: string;
  type: FinancialTransactionType;
  amount: number;
  transactionDate: string;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  createdBy: string;
  creatorName: string | null;
  createdAt: string;
}

export interface FinancialAccountsDashboardEntity {
  totalBalance: number;
  totalBankBalance: number;
  totalCashBalance: number;
  activeAccounts: number;
  inactiveAccounts: number;
}

export interface FinancialTransferResultEntity {
  transferId: string;
  debit: FinancialTransactionEntity;
  credit: FinancialTransactionEntity;
}

// Fase 80 -- Conciliacao Bancaria. Espelha
// apps/api/src/bank-reconciliation/entities/*.ts.
export interface BankTransactionEntity {
  id: string;
  financialAccountId: string;
  financialAccountName: string | null;
  date: string;
  description: string;
  amount: number;
  type: FinancialTransactionType;
  externalId: string | null;
  status: FinancialBankTransactionStatus;
  financialTransactionId: string | null;
  financialTransaction?: FinancialTransactionEntity | null;
  dateDifferenceDays?: number | null;
  importedAt: string;
  updatedAt: string;
}

export interface BankTransactionCandidateEntity {
  financialTransaction: FinancialTransactionEntity;
  exactMatch: boolean;
  dateDifferenceDays: number;
}

export interface BankReconciliationDashboardEntity {
  totalCount: number;
  matchedCount: number;
  pendingCount: number;
  divergentCount: number;
  matchedAmount: number;
  pendingAmount: number;
  divergentAmount: number;
}

export interface ImportBankTransactionRowErrorEntity {
  row: number;
  message: string;
}

export interface ImportBankTransactionsResultEntity {
  rowsRead: number;
  imported: number;
  duplicates: number;
  invalid: number;
  errors: ImportBankTransactionRowErrorEntity[];
}

// Fase 83 -- catalogo de pecas e ledger de estoque. Espelha
// apps/api/src/parts/entities/*.ts. currentStock/isLowStock sao cache
// persistido no backend (nunca calculado no frontend).
export interface PartEntity {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  category: string | null;
  manufacturer: string | null;
  oemCode: string | null;
  minStock: number | null;
  currentStock: number;
  isLowStock: boolean;
  isZeroStock: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PartStockMovementEntity {
  id: string;
  partId: string;
  type: PartStockMovementType;
  quantity: number;
  unitCost: number | null;
  movementDate: string;
  reason: string | null;
  reference: string | null;
  notes: string | null;
  maintenanceId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PartsDashboardEntity {
  totalParts: number;
  activeParts: number;
  inactiveParts: number;
  lowStockCount: number;
  zeroStockCount: number;
  estimatedStockValue: number | null;
  estimatedStockValueUnavailableReason: string | null;
  partsWithoutKnownCost: number;
  entriesInPeriod: number;
  exitsInPeriod: number;
}

// Fase 84 -- oficina/fornecedor de manutencao (MaintenanceProvider,
// discriminado por `type`). Espelha apps/api/src/maintenance-providers/entities/*.ts.
export interface MaintenanceProviderEntity {
  id: string;
  tenantId: string;
  type: MaintenanceProviderType;
  name: string;
  tradeName: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contactName: string | null;
  specialties: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceProviderSummaryEntity {
  osCount: number;
  vehiclesServedCount: number;
  totalCost: number | null;
  lastUsedAt: string | null;
}
