import { NotificationType, UserRole } from '@prisma/client';
import { NOTIFICATION_RECIPIENT_ROLES } from '../constants/notification-recipient-roles.constants';

// Fase 69 -- funcao pura (extraida para ser testavel isoladamente, mesmo
// principio de isCriticalOpenOccurrence na Fase 68): dado o conjunto de
// usuarios elegiveis JA carregado em lote (1 query, ver
// NotificationsService.resolveRecipients) e os tipos de notificacao
// presentes nesta geracao, agrupa os ids de destinatario por tipo. Nunca
// consulta o banco -- so classifica em memoria.
export function groupRecipientsByType(
  users: { id: string; role: UserRole }[],
  types: NotificationType[],
): Map<NotificationType, string[]> {
  const result = new Map<NotificationType, string[]>();
  for (const type of types) {
    const allowedRoles = new Set(NOTIFICATION_RECIPIENT_ROLES[type]);
    result.set(
      type,
      users.filter((u) => allowedRoles.has(u.role)).map((u) => u.id),
    );
  }
  return result;
}

// Todos os roles com pelo menos 1 tipo elegivel entre `types` -- usado para
// buscar TODOS os candidatos a destinatario em 1 unica query (nunca 1 por
// tipo/candidato).
export function collectRolesNeeded(types: NotificationType[]): UserRole[] {
  return [...new Set(types.flatMap((t) => NOTIFICATION_RECIPIENT_ROLES[t]))];
}
