import { ApiPropertyOptional } from '@nestjs/swagger';
import { ChecklistTemplateStatus, ChecklistType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindChecklistTemplatesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ChecklistType })
  @IsOptional()
  @IsEnum(ChecklistType, { message: 'type invalido.' })
  type?: ChecklistType;

  @ApiPropertyOptional({ enum: ChecklistTemplateStatus })
  @IsOptional()
  @IsEnum(ChecklistTemplateStatus, { message: 'status invalido.' })
  status?: ChecklistTemplateStatus;
}
