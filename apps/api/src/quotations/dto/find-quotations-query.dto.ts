import { ApiPropertyOptional } from '@nestjs/swagger';
import { QuotationStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindQuotationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ enum: QuotationStatus })
  @IsOptional()
  @IsEnum(QuotationStatus, { message: 'status invalido.' })
  status?: QuotationStatus;

  @ApiPropertyOptional({ description: 'Busca livre por carga/condicoes ou nome do cliente.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ description: 'Periodo -- inicio (createdAt >=).' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Periodo -- fim (createdAt <=).' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
