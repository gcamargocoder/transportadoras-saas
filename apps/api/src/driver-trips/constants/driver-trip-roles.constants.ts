import { UserRole } from '@prisma/client';

// Unico role admitido em todo o modulo driver-trips (Fase 25) -- API propria
// do app do motorista, nunca reutiliza TRIP_READ_ROLES/TRIP_WRITE_ROLES
// (que excluem DRIVER de proposito, ver trip-roles.constants.ts).
export const DRIVER_TRIP_ROLES = [UserRole.DRIVER];
