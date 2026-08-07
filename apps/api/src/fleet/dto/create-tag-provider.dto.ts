import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateTagProviderDto {
  @ApiProperty({ example: 'Sem Parar' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: 'https://www.semparar.com.br' })
  @IsOptional()
  @IsUrl({}, { message: 'website deve ser uma URL valida.' })
  website?: string;

  @ApiPropertyOptional({ example: '0800 707 3444' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
