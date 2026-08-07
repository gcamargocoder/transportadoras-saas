import { describe, expect, it } from 'vitest';
import { UserRole } from '../../types/enums';
import { DASHBOARD_ROLES, hasRole, MANAGEMENT_ROLES } from './roles';

describe('hasRole', () => {
  it('nega acesso quando o usuário não está autenticado (role ausente)', () => {
    expect(hasRole(undefined, DASHBOARD_ROLES)).toBe(false);
    expect(hasRole(null, DASHBOARD_ROLES)).toBe(false);
  });

  it('libera qualquer usuário autenticado quando a lista de roles está vazia', () => {
    expect(hasRole(UserRole.DRIVER, [])).toBe(true);
    expect(hasRole(UserRole.SUPER_ADMIN, [])).toBe(true);
  });

  it('restringe o dashboard executivo a perfis de gestão', () => {
    expect(hasRole(UserRole.MANAGER, DASHBOARD_ROLES)).toBe(true);
    expect(hasRole(UserRole.OPERATOR, DASHBOARD_ROLES)).toBe(false);
    expect(hasRole(UserRole.DRIVER, DASHBOARD_ROLES)).toBe(false);
  });

  it('nunca inclui DRIVER nas roles de gestão', () => {
    expect(MANAGEMENT_ROLES).not.toContain(UserRole.DRIVER);
  });
});
