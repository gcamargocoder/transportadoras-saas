import { ApiProperty } from '@nestjs/swagger';
import { TenantSettingsEntity } from './tenant-settings.entity';

// Representacao publica do tenant (id/name/document/slug/status + settings
// aninhado). Combina os models Tenant + TenantSettings numa unica resposta
// de "perfil da empresa" sem duplicar colunas entre as duas tabelas.
export class TenantEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  tradeName!: string | null;

  @ApiProperty()
  document!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: TenantSettingsEntity, nullable: true })
  settings!: TenantSettingsEntity | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
