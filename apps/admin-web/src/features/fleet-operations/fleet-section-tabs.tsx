'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../utils/cn';

const FLEET_SECTION_TABS = [
  { href: '/operations/fleet', label: 'Visão geral' },
  { href: '/operations/fleet/costs', label: 'Custos' },
  { href: '/operations/fleet/maintenance', label: 'Manutenção' },
  { href: '/operations/fleet/stops', label: 'Paradas' },
  { href: '/operations/fleet/downtime-cost', label: 'Tempo parado' },
  { href: '/operations/fleet/fuel', label: 'Abastecimento' },
  { href: '/operations/fleet/vehicles', label: 'Veículos' },
  { href: '/operations/fleet/compositions', label: 'Composição' },
  { href: '/operations/fleet/tires', label: 'Pneus' },
  { href: '/operations/fleet/tolls', label: 'Pedágios' },
  { href: '/operations/fleet/financial', label: 'Financeiro' },
  { href: '/operations/fleet/fiscal', label: 'Fiscal' },
  { href: '/operations/fleet/freight', label: 'Fretes' },
  { href: '/operations/fleet/billing', label: 'Faturamento' },
] as const;

export function FleetSectionTabs(): JSX.Element {
  const pathname = usePathname();

  return (
    <nav
      className="scrollbar-thin sticky top-0 z-20 mb-6 flex gap-1 overflow-x-auto border-b border-border bg-surface-subtle"
      aria-label="Dashboards da frota"
    >
      {FLEET_SECTION_TABS.map((tab) => {
        const active = tab.href === '/operations/fleet' ? pathname === tab.href : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              active ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
