import { ApiProperty } from '@nestjs/swagger';
import { QuotationStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateQuotationStatusDto {
  @ApiProperty({ enum: QuotationStatus })
  @IsEnum(QuotationStatus, { message: 'status invalido.' })
  status!: QuotationStatus;
}
