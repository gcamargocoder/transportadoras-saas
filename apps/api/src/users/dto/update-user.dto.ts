import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_MIN_LENGTH,
} from '../../auth/constants/password-policy.constants';

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
    minLength: PASSWORD_MIN_LENGTH,
    description: 'Se informado, redefine a senha do usuario (uso administrativo).',
  })
  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `A senha deve ter no minimo ${PASSWORD_MIN_LENGTH} caracteres.` })
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password?: string;
}
