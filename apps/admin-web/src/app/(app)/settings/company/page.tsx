'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../../../components/ui/card';
import { ErrorState } from '../../../../components/ui/error-state';
import { FormField } from '../../../../components/ui/form-field';
import { Input } from '../../../../components/ui/input';
import { LoadingState } from '../../../../components/ui/loading-state';
import { PageHeader } from '../../../../components/ui/page-header';
import { useToast } from '../../../../components/ui/toast';
import { useAuth } from '../../../../hooks/use-auth';
import { toFriendlyMessage } from '../../../../lib/api/errors';
import { getMyTenant, updateMyTenant } from '../../../../lib/api/admin.api';
import { ADMIN_ROLES, hasRole } from '../../../../lib/auth/roles';
import { TENANT_STATUS_LABELS, TENANT_STATUS_TONE } from '../../../../lib/labels';
import type { TenantEntity } from '../../../../types/entities';

// Fase 49 -- mensagem objetiva de ciclo de vida, pedida explicitamente por
// status. dias restantes vem sempre calculado pelo backend
// (plan.trialDaysRemaining) -- nunca calculado aqui a partir do relogio do
// navegador.
function lifecycleMessage(tenant: TenantEntity): string {
  switch (tenant.status) {
    case 'TRIAL': {
      const days = tenant.plan?.trialDaysRemaining;
      return days != null
        ? `Seu período de avaliação termina em ${days} dia${days === 1 ? '' : 's'}.`
        : 'Você está no período de avaliação.';
    }
    case 'EXPIRED':
      return 'Período de avaliação encerrado.';
    case 'SUSPENDED':
      return 'Esta conta está suspensa.';
    case 'ACTIVE':
    default:
      return 'Plano ativo.';
  }
}

const schema = z.object({
  name: z.string().min(1, 'Informe a razão social.'),
  tradeName: z.string().optional(),
  logoUrl: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function CompanySettingsPage(): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canEdit = hasRole(user?.role, ADMIN_ROLES);

  const tenantQuery = useQuery({ queryKey: ['tenants', 'me'], queryFn: () => getMyTenant() });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (tenantQuery.data) {
      reset({
        name: tenantQuery.data.name,
        tradeName: tenantQuery.data.tradeName ?? '',
        logoUrl: tenantQuery.data.logoUrl ?? '',
      });
    }
  }, [tenantQuery.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => updateMyTenant(values),
    onSuccess: () => {
      toast.success('Dados da empresa atualizados.');
      queryClient.invalidateQueries({ queryKey: ['tenants', 'me'] });
    },
    onError: (error) =>
      toast.error('Não foi possível salvar as alterações.', toFriendlyMessage(error)),
  });

  if (tenantQuery.isLoading) return <LoadingState label="Carregando empresa" />;
  if (tenantQuery.isError || !tenantQuery.data)
    return <ErrorState onRetry={() => tenantQuery.refetch()} />;

  return (
    <div>
      <PageHeader title="Empresa" description="Dados cadastrais da transportadora." />

      <Card className="mb-6 max-w-2xl">
        <CardBody>
          <div className="flex items-center gap-3">
            <Badge tone={TENANT_STATUS_TONE[tenantQuery.data.status]}>
              {TENANT_STATUS_LABELS[tenantQuery.data.status]}
            </Badge>
            <p className="text-sm text-ink-muted">{lifecycleMessage(tenantQuery.data)}</p>
          </div>
        </CardBody>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader
          title="Dados gerais"
          description={canEdit ? undefined : 'Apenas administradores podem editar estes dados.'}
        />
        <CardBody>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
          >
            <FormField label="Razão social" htmlFor="name" required error={errors.name?.message}>
              <Input
                id="name"
                disabled={!canEdit}
                invalid={Boolean(errors.name)}
                {...register('name')}
              />
            </FormField>
            <FormField label="Nome fantasia" htmlFor="tradeName" hint="Opcional">
              <Input id="tradeName" disabled={!canEdit} {...register('tradeName')} />
            </FormField>
            <FormField label="URL do logotipo" htmlFor="logoUrl" hint="Opcional">
              <Input id="logoUrl" disabled={!canEdit} {...register('logoUrl')} />
            </FormField>
            <FormField label="CNPJ" htmlFor="document">
              <Input id="document" value={tenantQuery.data.document} disabled />
            </FormField>
            {canEdit && (
              <div className="flex justify-end">
                <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                  Salvar alterações
                </Button>
              </div>
            )}
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
