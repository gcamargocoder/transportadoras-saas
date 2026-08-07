'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, LogOut, Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/use-auth';
import { getMyTenant } from '../../lib/api/admin.api';
import { ROLE_LABELS } from '../../lib/labels';
import { Dropdown } from '../ui/dropdown';

export function Header({ onMenuClick }: { onMenuClick: () => void }): JSX.Element {
  const { user, logout } = useAuth();
  const router = useRouter();

  // Exibicao informativa da empresa atual -- NAO e um seletor funcional de
  // tenant: a API nao expoe um endpoint de troca de contexto/impersonation,
  // entao nao inventamos essa capacidade aqui (ver relatorio final).
  const { data: tenant } = useQuery({
    queryKey: ['tenants', 'me'],
    queryFn: () => getMyTenant(),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(user),
  });

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
          <Menu size={18} />
        </button>
        {tenant && (
          <span className="hidden items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-ink-muted sm:flex">
            <Building2 size={12} />
            {tenant.tradeName ?? tenant.name}
          </span>
        )}
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
              <span className="block text-xs leading-tight text-ink-subtle">
                {user ? ROLE_LABELS[user.role] : ''}
              </span>
            </span>
          </span>
        }
        items={[{ label: 'Sair', icon: <LogOut size={14} />, onClick: handleLogout, danger: true }]}
      />
    </header>
  );
}
