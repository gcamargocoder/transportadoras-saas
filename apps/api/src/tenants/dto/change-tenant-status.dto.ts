import { ApiProperty } from '@nestjs/swagger';
import { TenantStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

// Fase 47 -- distinto de UpdateTenantStatusDto (PATCH /tenants/me/status,
// self-service, so isActive booleano). Este DTO e exclusivo de
// PATCH /tenants/:id/status (SUPER_ADMIN), o status de ciclo de vida mais
// rico da plataforma.
export class ChangeTenantStatusDto {
  @ApiProperty({ enum: TenantStatus, example: TenantStatus.ACTIVE })
  @IsEnum(TenantStatus, { message: 'status invalido.' })
  status!: TenantStatus;
}
