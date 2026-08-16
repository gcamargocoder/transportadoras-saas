import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_MIN_LENGTH,
} from '../../auth/constants/password-policy.constants';

// Dados minimos do primeiro usuario administrador, criado junto com o
// tenant na mesma transacao (ver TenantsService.create).
export class CreateTenantAdminDto {
  @ApiProperty({ example: 'Maria Administradora' })
  @IsString()
  @MinLength(2, { message: 'name deve ter no minimo 2 caracteres.' })
  name!: string;

  @ApiProperty({ example: 'admin@empresa.com.br' })
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email!: string;

  @ApiProperty({ example: 'SenhaForte123!', minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `A senha deve ter no minimo ${PASSWORD_MIN_LENGTH} caracteres.` })
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password!: string;
}
