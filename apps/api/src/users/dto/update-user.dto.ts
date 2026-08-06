import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'João Operador' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'joao@empresa.com.br' })
  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole, { message: 'role invalida.' })
  role?: UserRole;

  @ApiPropertyOptional({
    minLength: 8,
    description: 'Se informado, redefine a senha do usuario (uso administrativo).',
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'A senha deve ter no minimo 8 caracteres.' })
  password?: string;
}
