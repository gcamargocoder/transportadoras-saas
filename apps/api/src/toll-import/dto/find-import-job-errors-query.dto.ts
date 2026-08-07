import { ApiPropertyOptional } from '@nestjs/swagger';
import { ImportRowIssueType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindImportJobErrorsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ImportRowIssueType })
  @IsOptional()
  @IsEnum(ImportRowIssueType, { message: 'issueType invalido.' })
  issueType?: ImportRowIssueType;
}
