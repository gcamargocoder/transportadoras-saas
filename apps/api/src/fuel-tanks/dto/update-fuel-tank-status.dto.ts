import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateFuelTankStatusDto {
  @ApiProperty({ example: false, description: 'true = ativo, false = inativo (rejeita novas movimentacoes).' })
  @IsBoolean()
  isActive!: boolean;
}
