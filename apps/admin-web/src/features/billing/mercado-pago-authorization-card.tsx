'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { useToast } from '../../components/ui/toast';
import { createMercadoPagoAuthorization, getMySubscription } from '../../lib/api/billing.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_TONE } from '../../lib/labels';

// [Mercado Pago] Self-service (/settings/company). So renderiza algo quando
// o tenant tem uma assinatura configurada para MERCADO_PAGO -- a maioria dos
// tenants (fluxo manual) nunca ve esta secao. Erros (inclusive 404 quando o
// tenant nao tem assinatura) sao tratados como "nada a mostrar", nunca uma
// caixa de erro ruidosa para uma secao secundaria/opcional.
export function MercadoPagoAuthorizationCard(): JSX.Element | null {
  const toast = useToast();

  const subscriptionQuery = useQuery({
    queryKey: ['billing', 'subscriptions', 'me'],
    queryFn: () => getMySubscription(),
    retry: false,
  });

  const authorizationMutation = useMutation({
    mutationFn: () => createMercadoPagoAuthorization(),
    onSuccess: (data) => {
      window.location.href = data.initPoint;
    },
    onError: (error) => toast.error('Não foi possível iniciar a autorização.', toFriendlyMessage(error)),
  });

  const subscription = subscriptionQuery.data;
  if (!subscription || subscription.paymentMethod !== 'MERCADO_PAGO') {
    return null;
  }

  const canAuthorize = subscription.status !== 'ACTIVE';

  return (
    <Card className="mt-6 max-w-2xl">
      <CardHeader title="Cobrança automática" description="Assinatura cobrada via Mercado Pago." />
      <CardBody>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Badge tone={SUBSCRIPTION_STATUS_TONE[subscription.status]}>
              {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
            </Badge>
            {subscription.status === 'ACTIVE' && (
              <p className="text-sm text-ink-muted">
                Próximo vencimento: {new Date(subscription.nextDueDate).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
          {canAuthorize && (
            <div>
              <Button type="button" loading={authorizationMutation.isPending} onClick={() => authorizationMutation.mutate()}>
                Autorizar no Mercado Pago
              </Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
