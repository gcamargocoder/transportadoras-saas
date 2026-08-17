import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Unica transicao manual permitida via PATCH e para PAID -- as demais
// (DRAFT/READY/PARTIALLY_INVOICED/INVOICED) sao sempre derivadas dos
// valores (ver billing-status.util.ts) e CANCELLED tem endpoint proprio
// (POST .../cancel), nunca setado por aqui.
export class UpdateTripBillingDto {
  @ApiPropertyOptional({ enum: ['PAID'], description: 'Confirmacao manual de recebimento -- nunca inferida automaticamente.' })
  @IsOptional()
  @IsIn(['PAID'], { message: 'Somente a transicao manual para PAID e permitida via PATCH.' })
  status?: 'PAID';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
