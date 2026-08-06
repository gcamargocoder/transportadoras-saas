import { ApiProperty } from '@nestjs/swagger';

// Leitura de uma entrada de AuditLog -- espelha os campos gravados por
// AuditService.log() (ver audit/interfaces/audit-log-entry.interface.ts),
// incluindo o mapeamento deviceInfo -> userAgent para o nome ja usado em
// RequestMetadata no restante da API.
export class AuditLogEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Quem executou a acao.' })
  userId!: string | null;

  @ApiProperty({ example: 'vehicle.updated' })
  action!: string;

  @ApiProperty({ example: 'Vehicle' })
  entityName!: string;

  @ApiProperty({ format: 'uuid' })
  entityId!: string;

  @ApiProperty({ type: Object, nullable: true, description: 'Estado anterior a mutacao.' })
  previousValue!: unknown;

  @ApiProperty({ type: Object, nullable: true, description: 'Estado apos a mutacao.' })
  newValue!: unknown;

  @ApiProperty({ nullable: true })
  ipAddress!: string | null;

  @ApiProperty({ nullable: true })
  userAgent!: string | null;

  @ApiProperty({ description: 'Quando a acao ocorreu.' })
  createdAt!: Date;
}
