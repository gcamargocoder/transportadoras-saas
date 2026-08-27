import { ApiProperty } from '@nestjs/swagger';

// Fase 93 -- observacoes/interacoes comerciais. Somente criacao e listagem
// (append-only, mesmo espirito de um log de interacoes): nunca editado
// depois de criado, entao nao ha updatedAt/update DTO.
export class CustomerNoteEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty({ format: 'uuid' })
  customerId!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty()
  createdAt!: Date;
}
