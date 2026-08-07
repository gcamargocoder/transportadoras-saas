import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class CreateFuelStationDto {
  @ApiProperty({ example: 'Posto Graal BR-116' })
  @IsString()
  @MinLength(1, { message: 'name e obrigatorio.' })
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: '12345678000199' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnpj?: string;

  @ApiPropertyOptional({ example: 'Curitiba' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  city?: string;

  @ApiPropertyOptional({ example: 'PR' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
