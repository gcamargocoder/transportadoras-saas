import { NotificationType, UserRole } from '@prisma/client';

// Fase 69 -- politica de destinatarios por tipo (secao 6 do pedido).
// AUDITOR nunca aparece: notificacoes implicam acao necessaria, auditor e
// leitura/fiscalizacao (mesmo criterio ja usado para excluir DRIVER dos
// modulos administrativos em todo o projeto). DRIVER nunca aparece aqui
// (este mapa e so o grupo POR ROLE) -- os 2 tipos da Fase 70
// (DELIVERY_PROOF_PENDING/PROBLEM) notificam o motorista da propria
// viagem via um mecanismo SEPARADO e direto (NotificationCandidate.
// directRecipientIds, ver NotificationsService), nunca "todo motorista
// com este role", entao continuam fora deste mapa por role.
const OPERATIONAL_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.OPERATOR,
  UserRole.DISPATCHER,
];

const MANAGEMENT_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];

export const NOTIFICATION_RECIPIENT_ROLES: Record<NotificationType, UserRole[]> = {
  CRITICAL_OCCURRENCE: OPERATIONAL_ROLES,
  VEHICLE_UNAVAILABLE: OPERATIONAL_ROLES,
  VEHICLE_MAINTENANCE: OPERATIONAL_ROLES,
  TIRE_NEAR_REPLACEMENT: OPERATIONAL_ROLES,
  FUEL_ODOMETER_REGRESSION: OPERATIONAL_ROLES,
  FISCAL_DOCUMENT_PROBLEM: OPERATIONAL_ROLES,
  TRIP_DELAYED: OPERATIONAL_ROLES,
  // Suspensao/inatividade de motorista e decisao de gestao de pessoas --
  // mais restrito que os demais (nunca OPERATOR/DISPATCHER).
  DRIVER_SUSPENDED: MANAGEMENT_ROLES,
  DRIVER_INACTIVE: MANAGEMENT_ROLES,
  // Faturamento -- mesmo grupo de MANAGEMENT_ROLES (o modulo billing-
  // operational nao tem um role "financeiro" dedicado; ver
  // BILLING_WRITE_ROLES, que e o mais proximo e ja exclui AUDITOR/DRIVER).
  BILLING_PENDING: MANAGEMENT_ROLES,
  // Fase 70 -- grupo operacional recebe alem do motorista (directRecipientIds).
  DELIVERY_PROOF_PENDING: OPERATIONAL_ROLES,
  DELIVERY_PROOF_PROBLEM: OPERATIONAL_ROLES,
  // Fase 98 -- renovacao de contrato e decisao comercial/gestao, mesmo
  // grupo de BILLING_PENDING/DRIVER_SUSPENDED (nunca OPERATOR/DISPATCHER).
  CONTRACT_EXPIRING: MANAGEMENT_ROLES,
};

// Todos os roles com PELO MENOS 1 tipo de notificacao elegivel -- usado
// para resolver TODOS os destinatarios candidatos em 1 unica query
// (nunca 1 query por tipo/candidato).
export const ALL_NOTIFICATION_RECIPIENT_ROLES: UserRole[] = [...new Set(Object.values(NOTIFICATION_RECIPIENT_ROLES).flat())];
