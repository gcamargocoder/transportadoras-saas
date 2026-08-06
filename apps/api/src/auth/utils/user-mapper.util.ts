import { UserAccount } from '@prisma/client';
import { AuthenticatedUser } from '../entities/authenticated-user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

// Unico lugar que converte a linha crua do Prisma (que inclui passwordHash)
// para o formato seguro exposto pela API. Nunca serializar UserAccount
// diretamente em uma resposta HTTP.
export function toAuthenticatedUser(user: UserAccount): AuthenticatedUser {
  const authenticatedUser = new AuthenticatedUser();
  authenticatedUser.id = user.id;
  authenticatedUser.email = user.email;
  authenticatedUser.name = user.name;
  authenticatedUser.role = user.role;
  authenticatedUser.tenantId = user.tenantId;
  return authenticatedUser;
}

export function toJwtPayload(user: UserAccount): JwtPayload {
  return {
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  };
}
