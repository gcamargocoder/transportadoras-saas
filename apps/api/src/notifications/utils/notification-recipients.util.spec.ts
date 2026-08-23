import { UserRole } from '@prisma/client';
import { collectRolesNeeded, groupRecipientsByType } from './notification-recipients.util';

describe('collectRolesNeeded', () => {
  it('nunca inclui AUDITOR ou DRIVER (nenhum tipo desta fase os elege)', () => {
    const roles = collectRolesNeeded(['CRITICAL_OCCURRENCE', 'DRIVER_SUSPENDED', 'BILLING_PENDING']);
    expect(roles).not.toContain(UserRole.AUDITOR);
    expect(roles).not.toContain(UserRole.DRIVER);
  });

  it('DRIVER_SUSPENDED/DRIVER_INACTIVE/BILLING_PENDING sao mais restritos (nunca OPERATOR/DISPATCHER)', () => {
    const roles = collectRolesNeeded(['DRIVER_SUSPENDED']);
    expect(roles).not.toContain(UserRole.OPERATOR);
    expect(roles).not.toContain(UserRole.DISPATCHER);
    expect(roles).toEqual(expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]));
  });

  it('agrega sem duplicar roles entre tipos operacionais', () => {
    const roles = collectRolesNeeded(['CRITICAL_OCCURRENCE', 'VEHICLE_UNAVAILABLE', 'TRIP_DELAYED']);
    expect(new Set(roles).size).toBe(roles.length);
  });

  // Fase 70 -- DELIVERY_PROOF_PENDING/PROBLEM usam o grupo OPERACIONAL por
  // role (admin/manager/operator/dispatcher); o motorista da propria
  // viagem e endereçado por um mecanismo SEPARADO (directRecipientIds em
  // NotificationsService), nunca "todo usuario com role DRIVER" -- por
  // isso DRIVER nunca aparece aqui, mesmo para estes 2 tipos novos.
  it('DELIVERY_PROOF_PENDING/DELIVERY_PROOF_PROBLEM usam o grupo operacional e nunca elegem DRIVER por role', () => {
    const roles = collectRolesNeeded(['DELIVERY_PROOF_PENDING', 'DELIVERY_PROOF_PROBLEM']);
    expect(roles).not.toContain(UserRole.DRIVER);
    expect(roles).not.toContain(UserRole.AUDITOR);
    expect(roles).toEqual(
      expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.DISPATCHER]),
    );
  });
});

describe('groupRecipientsByType', () => {
  const users = [
    { id: 'admin-1', role: UserRole.ADMIN },
    { id: 'manager-1', role: UserRole.MANAGER },
    { id: 'operator-1', role: UserRole.OPERATOR },
  ];

  it('CRITICAL_OCCURRENCE inclui OPERATOR', () => {
    const grouped = groupRecipientsByType(users, ['CRITICAL_OCCURRENCE']);
    expect(grouped.get('CRITICAL_OCCURRENCE')).toEqual(expect.arrayContaining(['admin-1', 'manager-1', 'operator-1']));
  });

  it('DRIVER_SUSPENDED exclui OPERATOR', () => {
    const grouped = groupRecipientsByType(users, ['DRIVER_SUSPENDED']);
    expect(grouped.get('DRIVER_SUSPENDED')).toEqual(['admin-1', 'manager-1']);
    expect(grouped.get('DRIVER_SUSPENDED')).not.toContain('operator-1');
  });

  it('um usuario sem role elegivel para nenhum tipo presente nao aparece em nenhuma lista', () => {
    const usersWithAuditor = [...users, { id: 'auditor-1', role: UserRole.AUDITOR }];
    const grouped = groupRecipientsByType(usersWithAuditor, ['CRITICAL_OCCURRENCE', 'DRIVER_SUSPENDED']);
    expect(grouped.get('CRITICAL_OCCURRENCE')).not.toContain('auditor-1');
    expect(grouped.get('DRIVER_SUSPENDED')).not.toContain('auditor-1');
  });

  it('tipo sem nenhum usuario elegivel entre os carregados devolve lista vazia', () => {
    const grouped = groupRecipientsByType([], ['CRITICAL_OCCURRENCE']);
    expect(grouped.get('CRITICAL_OCCURRENCE')).toEqual([]);
  });

  it('DELIVERY_PROOF_PENDING inclui o grupo operacional por role (destinatario motorista e adicionado a parte, fora desta funcao)', () => {
    const grouped = groupRecipientsByType(users, ['DELIVERY_PROOF_PENDING']);
    expect(grouped.get('DELIVERY_PROOF_PENDING')).toEqual(expect.arrayContaining(['admin-1', 'manager-1', 'operator-1']));
  });
});
