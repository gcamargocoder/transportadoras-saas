import { ApiProperty } from '@nestjs/swagger';
import { AlertSeverity, NotificationType } from '@prisma/client';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';

// Fase 69 -- Centro de Alertas e Notificacoes. Nunca duplica dados da
// entidade de origem: entityType/entityId apontam para ela, metadata so
// carrega o minimo necessario para a UI navegar ate la (ex: tripId/
// vehicleId quando entityId sozinho nao e "abrivel" numa rota existente).
export class NotificationEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ enum: AlertSeverity })
  severity!: AlertSeverity;

  @ApiProperty({ description: 'Nome do model de origem (ex: "TripOccurrence", "Vehicle", "Driver").' })
  entityType!: string;

  @ApiProperty({ format: 'uuid' })
  entityId!: string;

  @ApiProperty({ nullable: true, type: 'object', description: 'Dados minimos para navegacao (ex: {tripId} / {vehicleId}), nunca um snapshot da origem.' })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ nullable: true, description: 'Preenchido quando o destinatario le a notificacao.' })
  readAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}

export class PaginatedNotificationsEntity {
  @ApiProperty({ type: [NotificationEntity] })
  items!: NotificationEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}

export class UnreadNotificationCountEntity {
  @ApiProperty()
  total!: number;

  @ApiProperty({ description: 'Subconjunto de total com severity=CRITICAL.' })
  critical!: number;
}
