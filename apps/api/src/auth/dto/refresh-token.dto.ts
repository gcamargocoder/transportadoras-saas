import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token emitido no login (ou na ultima rotacao).' })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken e obrigatorio.' })
  refreshToken!: string;
}
