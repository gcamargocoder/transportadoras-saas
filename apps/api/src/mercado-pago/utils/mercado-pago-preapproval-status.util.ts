import { SubscriptionStatus } from '@prisma/client';

// Mapeia o status cru do preapproval do Mercado Pago para o SubscriptionStatus
// do nosso dominio. Retorna null para status desconhecido/sem mapeamento --
// o webhook ignora o evento nesse caso, nunca escreve um status inventado.
export function mapMercadoPagoPreapprovalStatus(status: string): SubscriptionStatus | null {
  switch (status) {
    case 'authorized':
      return 'ACTIVE';
    case 'paused':
      return 'SUSPENDED';
    case 'cancelled':
      return 'CANCELLED';
    case 'pending':
      return 'PENDING';
    default:
      return null;
  }
}
