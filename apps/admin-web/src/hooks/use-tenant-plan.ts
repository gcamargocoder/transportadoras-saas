'use client';

import { useQuery } from '@tanstack/react-query';
import { getMyTenant } from '../lib/api/admin.api';
import type { TenantPlanEntity } from '../types/entities';
import { useAuth } from './use-auth';

// Fase 48 -- reaproveita GET /tenants/me (ja existente, usado em
// /settings/company) e a MESMA query key (['tenants', 'me']) -- cache
// compartilhado do React Query, nunca um fetch a mais. Usado pelo filtro de
// modulos do menu (sidebar-nav.tsx) e pelos indicadores de limite.
export function useTenantPlan(): { plan: TenantPlanEntity | null; isLoading: boolean } {
  const { status } = useAuth();
  const query = useQuery({
    queryKey: ['tenants', 'me'],
    queryFn: () => getMyTenant(),
    enabled: status === 'authenticated',
  });

  return { plan: query.data?.plan ?? null, isLoading: query.isLoading };
}
