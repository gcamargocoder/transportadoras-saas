import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_MIN_LENGTH,
} from '../../auth/constants/password-policy.constants';

export class CreateUserDto {
  @ApiProperty({ example: 'João Operador' })
  @IsString()
  @MinLength(2, { message: 'name deve ter no minimo 2 caracteres.' })
  name!: string;

  @ApiProperty({ example: 'joao@empresa.com.br' })
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email!: string;

  @ApiProperty({ example: 'SenhaForte123!', minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `A senha deve ter no minimo ${PASSWORD_MIN_LENGTH} caracteres.` })
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.OPERATOR })
  @IsEnum(UserRole, { message: 'role invalida.' })
  role!: UserRole;
}
