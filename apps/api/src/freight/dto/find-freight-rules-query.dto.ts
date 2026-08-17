import { ApiPropertyOptional } from '@nestjs/swagger';
import { FreightRuleStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindFreightRulesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  freightTableId?: string;

  @ApiPropertyOptional({
    enum: FreightRuleStatus,
    description: 'Default: nenhum filtro (retorna todas as versoes, ACTIVE e ARCHIVED).',
  })
  @IsOptional()
  @IsEnum(FreightRuleStatus, { message: 'status invalido.' })
  status?: FreightRuleStatus;
}
