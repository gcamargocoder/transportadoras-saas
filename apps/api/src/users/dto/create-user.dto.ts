import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'João Operador' })
  @IsString()
  @MinLength(2, { message: 'name deve ter no minimo 2 caracteres.' })
  name!: string;

  @ApiProperty({ example: 'joao@empresa.com.br' })
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email!: string;

  @ApiProperty({ example: 'SenhaForte123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter no minimo 8 caracteres.' })
  password!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.OPERATOR })
  @IsEnum(UserRole, { message: 'role invalida.' })
  role!: UserRole;
}
