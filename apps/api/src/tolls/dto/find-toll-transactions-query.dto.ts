import { ApiPropertyOptional } from '@nestjs/swagger';
import { TollTransactionStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum TollTransactionSortField {
  CHARGED_AT = 'chargedAt',
  CREATED_AT = 'createdAt',
}

export class FindTollTransactionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por viagem.' })
  @IsOptional()
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por veiculo.' })
  @IsOptional()
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por motorista.' })
  @IsOptional()
  @IsUUID('4', { message: 'driverId deve ser um UUID valido.' })
  driverId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por operadora da tag.' })
  @IsOptional()
  @IsUUID('4', { message: 'tagProviderId deve ser um UUID valido.' })
  tagProviderId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por praca de pedagio.' })
  @IsOptional()
  @IsUUID('4', { message: 'tollPlazaId deve ser um UUID valido.' })
  tollPlazaId?: string;

  @ApiPropertyOptional({ enum: TollTransactionStatus })
  @IsOptional()
  @IsEnum(TollTransactionStatus)
  status?: TollTransactionStatus;

  @ApiPropertyOptional({ description: 'Periodo: cobrado a partir de (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  chargedFrom?: string;

  @ApiPropertyOptional({ description: 'Periodo: cobrado ate (ISO 8601).' })
  @IsOptional()
  @IsDateString()
  chargedTo?: string;

  @ApiPropertyOptional({
    enum: TollTransactionSortField,
    default: TollTransactionSortField.CHARGED_AT,
  })
  @IsOptional()
  @IsIn(Object.values(TollTransactionSortField))
  sortBy: TollTransactionSortField = TollTransactionSortField.CHARGED_AT;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'desc';
}
