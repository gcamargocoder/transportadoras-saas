import { ApiPropertyOptional } from '@nestjs/swagger';
import { ChecklistExecutionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindChecklistExecutionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string;

  @ApiPropertyOptional({ enum: ChecklistExecutionStatus })
  @IsOptional()
  @IsEnum(ChecklistExecutionStatus, { message: 'status invalido.' })
  status?: ChecklistExecutionStatus;
}
