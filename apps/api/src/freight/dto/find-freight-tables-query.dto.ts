import { ApiPropertyOptional } from '@nestjs/swagger';
import { FreightTableStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindFreightTablesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  contractId?: string;

  @ApiPropertyOptional({ enum: FreightTableStatus })
  @IsOptional()
  @IsEnum(FreightTableStatus, { message: 'status invalido.' })
  status?: FreightTableStatus;

  @ApiPropertyOptional({ description: 'Busca livre por codigo/nome.' })
  @IsOptional()
  @IsString()
  search?: string;
}
