// Tipos espelhando 1:1 as *Entity do backend (apps/api/src/**/entities).
// Datas chegam como string ISO 8601 (serializacao JSON), nunca Date.
// Nao inventar campos: qualquer campo aqui precisa existir na entity real.
import type {
  AlertSeverity,
  AlertType,
  AxleEventSource,
  DocumentType,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
  FleetType,
  FuelType,
  ImportFileType,
  ImportJobStatus,
  ImportRowIssueType,
  LocationType,
  PaymentType,
  RevenueCategory,
  RouteTollEstimateSource,
  RouteVersionReason,
  SettlementStatus,
  SyncStatus,
  TireLocationType,
  TireStatus,
  TollMatchStatus,
  TollTransactionSource,
  TollTransactionStatus,
  TrailerType,
  TripLoadStatus,
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

export interface TenantEntity {
  id: string;
  name: string;
  tradeName: string | null;
  document: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
  settings: TenantSettingsEntity | null;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
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

export interface MaintenanceEntity {
  id: string;
  tenantId: string;
  vehicleId: string;
  type: VehicleMaintenanceType;
  status: VehicleMaintenanceStatus;
  priority: VehicleMaintenancePriority;
  openedAt: string;
  scheduledAt: string | null;
  completedAt: string | null;
  odometerKm: number | null;
  workshop: string | null;
  supplier: string | null;
  mechanic: string | null;
  responsibleUserId: string | null;
  description: string | null;
  notes: string | null;
  laborCost: number | null;
  partsCost: number | null;
  totalCost: number | null;
  serviceOrderNumber: string | null;
  warrantyUntil: string | null;
  nextReviewAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerEntity {
  id: string;
  tenantId: string;
  name: string;
  document: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface TripStopEntity {
  id: string;
  tripId: string;
  vehicleId: string;
  driverId: string;
  type: TripStopType;
  latitude: number;
  longitude: number;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  locationLabel: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
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
