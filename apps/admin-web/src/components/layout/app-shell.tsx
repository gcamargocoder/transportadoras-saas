'use client';

import { useState, type ReactNode } from 'react';
import { Drawer } from '../ui/drawer';
import { Header } from './header';
import { SidebarNav } from './sidebar-nav';

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-subtle">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-white lg:block">
        <SidebarNav />
      </aside>

      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} side="left">
        <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <main className="scrollbar-thin flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
