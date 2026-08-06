import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

// Representacao segura do usuario autenticado -- nunca inclui passwordHash.
// E o formato devolvido no corpo de login/refresh (campo "user") e serve
// tambem como schema Swagger (via @ApiProperty).
export class AuthenticatedUser {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'usuario@empresa.com.br' })
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;
}
