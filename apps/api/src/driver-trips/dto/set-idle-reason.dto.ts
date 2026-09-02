import { ApiProperty } from '@nestjs/swagger';
import { VehicleIdleReason } from '@prisma/client';
import { IsEnum } from 'class-validator';

// PATCH /driver/idle-period (Fase C) -- o motorista informa/corrige o MOTIVO
// do periodo ocioso ABERTO do veiculo que ele acabou de operar. NUNCA
// aceita duracao/datas -- so o motivo. O periodo em si (abrir/fechar, datas,
// duracao) e sempre gerido pelo backend (Fase B).
export class SetIdleReasonDto {
  @ApiProperty({ enum: VehicleIdleReason })
  @IsEnum(VehicleIdleReason, { message: 'reason invalido.' })
  reason!: VehicleIdleReason;
}
