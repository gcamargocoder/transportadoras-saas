import { AppShell } from '../../components/layout/app-shell';
import { RouteGuard } from '../../components/layout/route-guard';

export default function ProtectedLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <RouteGuard>
      <AppShell>{children}</AppShell>
    </RouteGuard>
  );
}
