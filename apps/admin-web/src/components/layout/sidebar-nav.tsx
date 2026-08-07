'use client';

import { Truck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../hooks/use-auth';
import { hasRole } from '../../lib/auth/roles';
import { NAV_GROUPS } from '../../lib/nav-config';
import { cn } from '../../utils/cn';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white">
          <Truck size={16} />
        </span>
        <span className="text-sm font-semibold tracking-tight text-ink">Transportadoras</span>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => hasRole(user?.role, item.roles));
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className="mb-4">
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {visibleItems.map((item) => {
                  const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      {...(onNavigate ? { onClick: onNavigate } : {})}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                      )}
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
