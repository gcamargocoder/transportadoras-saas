import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TollRouteStopItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'tollPlazaId deve ser um UUID valido.' })
  tollPlazaId!: string;
}
