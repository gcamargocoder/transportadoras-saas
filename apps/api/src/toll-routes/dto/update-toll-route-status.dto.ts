import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateTollRouteStatusDto {
  @ApiProperty({ example: false, description: 'Ativa/desativa a rota (nao exclui).' })
  @IsBoolean()
  isActive!: boolean;
}
