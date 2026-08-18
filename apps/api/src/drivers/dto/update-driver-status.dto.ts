import { ApiProperty } from '@nestjs/swagger';
import { DriverStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateDriverStatusDto {
  @ApiProperty({
    enum: DriverStatus,
    example: DriverStatus.SUSPENDED,
    description:
      'ACTIVE = ativa/reativa o motorista. INACTIVE = encerra o vinculo. SUSPENDED = bloqueio temporario. ' +
      'Qualquer valor diferente de ACTIVE bloqueia atribuicao a novas viagens e acesso ao Driver App.',
  })
  @IsEnum(DriverStatus, { message: 'status invalido.' })
  status!: DriverStatus;
}
