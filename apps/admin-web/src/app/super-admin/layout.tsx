import { SuperAdminGuard } from '../../components/layout/super-admin-guard';
import { SuperAdminShell } from '../../components/layout/super-admin-shell';

// Fase 47 -- fora do route group (app) de propósito: NÃO usa AppShell/
// SidebarNav da aplicação normal, layout próprio e claramente separado.
export default function SuperAdminLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <SuperAdminGuard>
      <SuperAdminShell>{children}</SuperAdminShell>
    </SuperAdminGuard>
  );
}
