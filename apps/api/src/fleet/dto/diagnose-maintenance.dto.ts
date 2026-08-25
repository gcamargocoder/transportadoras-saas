import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DiagnoseMaintenanceDto {
  @ApiProperty({ maxLength: 2000, description: 'Texto de diagnostico tecnico.' })
  @IsString()
  @MinLength(1, { message: 'diagnosis nao pode ser vazio.' })
  @MaxLength(2000)
  diagnosis!: string;
}
