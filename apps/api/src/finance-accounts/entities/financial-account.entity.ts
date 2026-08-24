import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FinancialAccountType } from '@prisma/client';

// Conta financeira (Fase 78) -- currentBalance e SEMPRE calculado
// (initialBalance + creditos - debitos), nunca uma coluna persistida (ver
// utils/account-balance.util.ts).
export class FinancialAccountEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: FinancialAccountType })
  type!: FinancialAccountType;

  @ApiProperty({ description: 'Saldo conhecido no momento do cadastro. Imutavel apos criado.' })
  initialBalance!: number;

  @ApiProperty({ description: 'initialBalance + SUM(CREDIT) - SUM(DEBIT). Calculado ao vivo, nunca persistido.' })
  currentBalance!: number;

  @ApiPropertyOptional({ nullable: true })
  bankName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  bankCode!: string | null;

  @ApiPropertyOptional({ nullable: true })
  accountNumberMasked!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiPropertyOptional({ nullable: true })
  creatorName!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
