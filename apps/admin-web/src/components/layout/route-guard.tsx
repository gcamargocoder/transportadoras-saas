'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { FullPageLoading } from '../ui/loading-state';

export function RouteGuard({ children }: { children: ReactNode }): JSX.Element | null {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'loading') return <FullPageLoading />;
  if (status === 'unauthenticated') return null;

  return <>{children}</>;
}
