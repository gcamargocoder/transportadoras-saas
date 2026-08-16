'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { hasRole, SUPER_ADMIN_ONLY } from '../../lib/auth/roles';
import { FullPageLoading } from '../ui/loading-state';

// Fase 47 -- area /super-admin: mesmo RouteGuard (autenticacao) + checagem
// de role SUPER_ADMIN_ONLY. Nunca um mecanismo de autenticacao paralelo --
// so decide para onde redirecionar; a autoridade real continua sendo o
// backend (403 em qualquer rota /tenants* administrativa se o role nao
// bater, mesmo que esta checagem de UI falhe por algum motivo).
export function SuperAdminGuard({ children }: { children: ReactNode }): JSX.Element | null {
  const { status, user } = useAuth();
  const router = useRouter();
  const isSuperAdmin = hasRole(user?.role, SUPER_ADMIN_ONLY);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status === 'authenticated' && !isSuperAdmin) {
      router.replace('/dashboard');
    }
  }, [status, isSuperAdmin, router]);

  if (status === 'loading') return <FullPageLoading />;
  if (status !== 'authenticated' || !isSuperAdmin) return null;

  return <>{children}</>;
}
