import { ApiProperty } from '@nestjs/swagger';
import { ExpenseStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTripExpenseStatusDto {
  @ApiProperty({ enum: ExpenseStatus, example: ExpenseStatus.APPROVED })
  @IsEnum(ExpenseStatus, { message: 'status invalido.' })
  status!: ExpenseStatus;
}
