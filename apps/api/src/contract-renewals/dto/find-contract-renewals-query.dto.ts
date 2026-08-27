import { ApiPropertyOptional } from '@nestjs/swagger';
import { ContractRenewalStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindContractRenewalsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Contrato anterior OU novo (aparece em ambos os lados de uma renovacao).' })
  @IsOptional()
  @IsUUID('4')
  contractId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ enum: ContractRenewalStatus })
  @IsOptional()
  @IsEnum(ContractRenewalStatus, { message: 'status invalido.' })
  status?: ContractRenewalStatus;
}
