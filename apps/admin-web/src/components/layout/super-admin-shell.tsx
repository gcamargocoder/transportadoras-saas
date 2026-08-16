'use client';

import { LayoutDashboard, LogOut, ShieldCheck, Building2, ArrowLeftCircle, Receipt } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { Dropdown } from '../ui/dropdown';
import { Drawer } from '../ui/drawer';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/super-admin', icon: LayoutDashboard },
  { label: 'Transportadoras', href: '/super-admin/tenants', icon: Building2 },
  { label: 'Cobrança', href: '/super-admin/billing', icon: Receipt },
] as const;

// Fase 47 -- shell PRÓPRIO da área /super-admin, deliberadamente distinto
// de AppShell/SidebarNav (área normal do app) -- nunca reutiliza o mesmo
// componente, para deixar visualmente óbvio que o usuário está na
// administração global da plataforma, não na empresa de ninguém.
function SuperAdminNav({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-ink text-white">
      <div className="flex h-16 shrink-0 items-center gap-2 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600">
          <ShieldCheck size={16} />
        </span>
        <span className="text-sm font-semibold tracking-tight">Plataforma</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
          Super administração
        </p>
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          href="/dashboard"
          {...(onNavigate ? { onClick: onNavigate } : {})}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ArrowLeftCircle size={16} className="shrink-0" />
          Voltar para o sistema
        </Link>
      </div>
    </div>
  );
}

function SuperAdminHeader({ onMenuClick }: { onMenuClick: () => void }): JSX.Element {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  const initials = (user?.name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-white/85 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-2 text-ink-muted hover:bg-surface-muted lg:hidden"
          aria-label="Abrir menu de navegação"
        >
          <ShieldCheck size={18} />
        </button>
        <span className="hidden items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 sm:flex">
          <ShieldCheck size={12} />
          Administração da plataforma
        </span>
      </div>

      <Dropdown
        align="end"
        trigger={
          <span className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-muted">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-ink">{user?.name}</span>
              <span className="block text-xs leading-tight text-ink-subtle">Super admin</span>
            </span>
          </span>
        }
        items={[{ label: 'Sair', icon: <LogOut size={14} />, onClick: handleLogout, danger: true }]}
      />
    </header>
  );
}

export function SuperAdminShell({ children }: { children: ReactNode }): JSX.Element {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-subtle">
      <aside className="hidden w-64 shrink-0 lg:block">
        <SuperAdminNav />
      </aside>

      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} side="left">
        <SuperAdminNav onNavigate={() => setMobileNavOpen(false)} />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <SuperAdminHeader onMenuClick={() => setMobileNavOpen(true)} />
        <main className="scrollbar-thin flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
