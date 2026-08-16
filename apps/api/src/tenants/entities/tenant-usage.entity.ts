import { ApiProperty } from '@nestjs/swagger';

// Fase 47 -- GET /tenants/:id/usage (SUPER_ADMIN). Distinto de
// TenantRelationshipCounts (usado so como guarda de exclusao, campos
// minimos) -- aqui e a visao completa de utilizacao real do tenant,
// exibida no detalhe da transportadora.
export class TenantUsageEntity {
  @ApiProperty()
  users!: number;

  @ApiProperty()
  drivers!: number;

  @ApiProperty()
  vehicles!: number;

  @ApiProperty()
  trips!: number;

  @ApiProperty()
  checklistExecutions!: number;

  @ApiProperty()
  fuelSupplies!: number;

  @ApiProperty()
  maintenances!: number;

  @ApiProperty({ description: 'Numero de anexos (evidencias de checklist etc.) -- proxy real de uso de armazenamento.' })
  attachments!: number;

  @ApiProperty({ description: 'Armazenamento real usado (MB), soma de Attachment + ImportJob com tamanho conhecido.' })
  storageUsedMb!: number;
}
