import { ApiPropertyOptional } from '@nestjs/swagger';
import { AlertSeverity, NotificationType } from '@prisma/client';
import { IsBooleanString, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// GET /notifications -- lista SEMPRE escopada ao usuario autenticado
// (recipientId), nunca a outro usuario (ver NotificationsController).
export class FindNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '"true" = so nao lidas, "false" = so lidas. Omitido = todas.' })
  @IsOptional()
  @IsBooleanString()
  unread?: string;

  @ApiPropertyOptional({ enum: NotificationType })
  @IsOptional()
  @IsEnum(NotificationType, { message: 'type invalido.' })
  type?: NotificationType;

  @ApiPropertyOptional({ enum: AlertSeverity })
  @IsOptional()
  @IsEnum(AlertSeverity, { message: 'severity invalido.' })
  severity?: AlertSeverity;

  @ApiPropertyOptional({ description: 'Nome do model de origem (ex: "TripOccurrence").' })
  @IsOptional()
  entityType?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
