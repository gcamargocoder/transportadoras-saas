import { ApiProperty } from '@nestjs/swagger';
import { AuthenticatedUser } from '../entities/authenticated-user.entity';

// Corpo de resposta de /auth/login e /auth/refresh. Puramente documental
// (Swagger) -- nao passa pelo ValidationPipe, que so valida DTOs de entrada.
export class AuthTokensDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: '15m', description: 'Validade do access token.' })
  expiresIn!: string;

  @ApiProperty({ type: AuthenticatedUser })
  user!: AuthenticatedUser;
}
