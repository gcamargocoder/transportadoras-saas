import type { VehicleMaintenanceStatus, VehicleStatus } from '../../types/enums';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const VEHICLE_STATUS_TONE: Record<VehicleStatus, Tone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  MAINTENANCE: 'warning',
  SOLD: 'danger',
};

export const MAINTENANCE_STATUS_TONE: Record<VehicleMaintenanceStatus, Tone> = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  WAITING_PARTS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};
