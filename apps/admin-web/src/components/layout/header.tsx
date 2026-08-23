'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/use-auth';
import { getMyTenant } from '../../lib/api/admin.api';
import { getUnreadNotificationCount } from '../../lib/api/notifications.api';
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

  // Fase 69 -- contador de nao lidas. Polling leve (60s): este e um centro
  // de notificacoes INTERNO (sem push), atualizacao quase em tempo real nao
  // e um requisito desta fase.
  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => getUnreadNotificationCount(),
    enabled: Boolean(user),
    refetchInterval: 60_000,
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

      <div className="flex items-center gap-1">
        <Link
          href="/notifications"
          className="relative rounded-md p-2 text-ink-muted hover:bg-surface-muted hover:text-ink"
          aria-label="Notificações"
        >
          <Bell size={18} />
          {unreadCount && unreadCount.total > 0 && (
            <span
              className={
                'absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ' +
                (unreadCount.critical > 0 ? 'bg-danger-600' : 'bg-brand-600')
              }
            >
              {unreadCount.total > 99 ? '99+' : unreadCount.total}
            </span>
          )}
        </Link>

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
      </div>
    </header>
  );
}
