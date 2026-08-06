import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

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

  @ApiProperty({ example: 'SenhaForte123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter no minimo 8 caracteres.' })
  password!: string;
}
