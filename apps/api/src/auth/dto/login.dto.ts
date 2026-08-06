import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';

export class LoginDto {
  // Chave composta (tenantId + email): o schema so garante unicidade de
  // e-mail DENTRO de um tenant (@@unique([tenantId, email])), entao o login
  // precisa saber a qual empresa o e-mail pertence. Sem subdominio ainda
  // (fase de Multi-tenant so prepara a estrutura), o tenant e informado
  // explicitamente aqui -- quando a resolucao automatica por subdominio/
  // slug existir, este campo podera se tornar opcional (preenchido pelo
  // TenantGuard/middleware a partir do host da requisicao).
  @ApiProperty({
    format: 'uuid',
    description: 'Id da transportadora (tenant) a qual o usuario pertence.',
  })
  @IsUUID('4', { message: 'tenantId deve ser um UUID valido.' })
  tenantId!: string;

  @ApiProperty({ example: 'usuario@empresa.com.br' })
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email!: string;

  @ApiProperty({ example: 'SenhaForte123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter no minimo 8 caracteres.' })
  password!: string;
}
