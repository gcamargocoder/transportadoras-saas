import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Industria Exemplo Ltda.' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: '12345678000199', description: 'CNPJ ou CPF, apenas digitos.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  document?: string;
}
