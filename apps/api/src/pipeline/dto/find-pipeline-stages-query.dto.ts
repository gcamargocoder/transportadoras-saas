import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ParseBooleanQuery } from '../../common/decorators/parse-boolean-query.decorator';

export class FindPipelineStagesQueryDto {
  @ApiPropertyOptional({ default: false, description: 'Inclui estagios inativos.' })
  @IsOptional()
  @ParseBooleanQuery()
  @IsBoolean()
  includeInactive?: boolean;
}
