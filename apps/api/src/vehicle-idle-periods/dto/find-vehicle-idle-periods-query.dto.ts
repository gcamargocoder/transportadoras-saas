import { ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleIdleReason } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// GET /fleet-operations/idle-periods (Fase B). `from`/`to` filtram por
// SOBREPOSICAO do periodo com a janela (mesma semantica de
// GET /fleet-operations/idle-time da Fase A). `open=true` traz so os
// periodos ainda abertos (endedAt IS NULL) -- "frota parada agora".
export class FindVehicleIdlePeriodsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: VehicleIdleReason })
  @IsOptional()
  @IsEnum(VehicleIdleReason, { message: 'reason invalido.' })
  reason?: VehicleIdleReason;

  @ApiPropertyOptional({ description: 'true = so periodos ABERTOS (veiculo parado agora).' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  open?: boolean;
}
