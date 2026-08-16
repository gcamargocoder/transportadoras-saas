import { ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceComponent } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindMaintenancePlansQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string;

  @ApiPropertyOptional({ enum: MaintenanceComponent })
  @IsOptional()
  @IsEnum(MaintenanceComponent, { message: 'component invalido.' })
  component?: MaintenanceComponent;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}
