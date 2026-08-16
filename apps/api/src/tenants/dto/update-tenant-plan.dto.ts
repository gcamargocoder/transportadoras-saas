import { ApiPropertyOptional } from '@nestjs/swagger';
import { TenantModule, TenantPlanTier } from '@prisma/client';
import { ArrayUnique, IsArray, IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

// Fase 47 -- PATCH /tenants/:id/plan (SUPER_ADMIN). Todos os campos
// opcionais (atualizacao parcial, mesmo padrao de UpdateTenantSettingsDto).
// Limites (maxUsers/maxVehicles/maxDrivers/maxStorageMb) nunca tem default
// aqui -- so quem envia explicitamente define um limite; omitir mantem o
// valor atual (nunca reseta para null silenciosamente).
export class UpdateTenantPlanDto {
  @ApiPropertyOptional({ enum: TenantPlanTier })
  @IsOptional()
  @IsEnum(TenantPlanTier, { message: 'tier invalido.' })
  tier?: TenantPlanTier;

  @ApiPropertyOptional({ description: 'Data de termino do trial (ISO 8601). null limpa o campo.' })
  @IsOptional()
  @IsDateString({}, { message: 'trialEndsAt deve ser uma data valida (ISO 8601).' })
  trialEndsAt?: string;

  @ApiPropertyOptional({ description: 'Limite de usuarios. Omitir mantem o atual.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @ApiPropertyOptional({ description: 'Limite de veiculos. Omitir mantem o atual.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxVehicles?: number;

  @ApiPropertyOptional({ description: 'Limite de motoristas. Omitir mantem o atual.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDrivers?: number;

  @ApiPropertyOptional({ description: 'Limite de armazenamento (MB). Omitir mantem o atual.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxStorageMb?: number;

  @ApiPropertyOptional({ enum: TenantModule, isArray: true, description: 'Substitui a lista inteira de modulos habilitados.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(TenantModule, { each: true, message: 'enabledModules contem um modulo invalido.' })
  enabledModules?: TenantModule[];
}
