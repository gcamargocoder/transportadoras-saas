import type { UserRole } from './enums';

// Espelha AuthenticatedUser (apps/api/src/auth/entities/authenticated-user.entity.ts)
// -- corpo "user" devolvido por POST /auth/login e POST /auth/refresh.
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: string;
  user: AuthenticatedUser;
}
