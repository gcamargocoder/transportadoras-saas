import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AppConfig } from '../../config/configuration';
import { compact } from '../../common/utils/compact.util';
import { MercadoPagoService } from '../../mercado-pago/services/mercado-pago.service';
import { mapMercadoPagoPreapprovalStatus } from '../../mercado-pago/utils/mercado-pago-preapproval-status.util';
import { isValidMercadoPagoSignature } from '../../mercado-pago/utils/mercado-pago-signature.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';

// Processa notificacoes assincronas do Mercado Pago. Sempre busca o estado
// ATUAL no Mercado Pago antes de agir (nunca confia cegamente no payload do
// webhook, que e so um "algo mudou, va conferir" -- pratica recomendada pelo
// proprio Mercado Pago) -- idempotente e tolerante a reordenacao/duplicatas.
@Injectable()
export class MercadoPagoWebhookService {
  private readonly logger = new Logger(MercadoPagoWebhookService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly mercadoPago: MercadoPagoService,
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  validateSignature(
    headers: { xSignature: string | undefined; xRequestId: string | undefined },
    dataId: string,
  ): boolean {
    const secret = this.configService.get('mercadoPago', { infer: true }).webhookSecret;
    if (!secret) {
      this.logger.warn('MERCADO_PAGO_WEBHOOK_SECRET nao configurado -- rejeitando webhook.');
      return false;
    }
    return isValidMercadoPagoSignature({
      xSignature: headers.xSignature,
      xRequestId: headers.xRequestId,
      dataId,
      secret,
    });
  }

  async process(type: string, dataId: string): Promise<void> {
    if (type === 'preapproval' || type === 'subscription_preapproval') {
      await this.processPreapproval(dataId);
      return;
    }
    if (type === 'payment') {
      await this.processPayment(dataId);
      return;
    }
    this.logger.log(`Evento Mercado Pago ignorado (type=${type}).`);
  }

  private async processPreapproval(preapprovalId: string): Promise<void> {
    const preapproval = await this.mercadoPago.getPreapproval(preapprovalId);
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { externalSubscriptionId: preapproval.id },
    });
    if (!subscription) {
      this.logger.warn(`Preapproval ${preapproval.id} nao corresponde a nenhuma assinatura conhecida.`);
      return;
    }

    const status = mapMercadoPagoPreapprovalStatus(preapproval.status);
    if (!status) {
      this.logger.log(`Preapproval ${preapproval.id} com status ${preapproval.status} sem mapeamento -- ignorado.`);
      return;
    }

    await this.prisma.tenantSubscription.update({
      where: { id: subscription.id },
      data: compact({ status, externalCustomerId: preapproval.payerId ?? undefined }),
    });
    this.logger.log(`Assinatura ${subscription.id} atualizada para ${status} via webhook Mercado Pago.`);
  }

  private async processPayment(paymentId: string): Promise<void> {
    const payment = await this.mercadoPago.getPayment(paymentId);
    if (payment.status !== 'approved') {
      this.logger.log(`Pagamento Mercado Pago ${payment.id} ignorado (status=${payment.status}).`);
      return;
    }
    if (!payment.externalReference) {
      this.logger.warn(`Pagamento Mercado Pago ${payment.id} aprovado sem externalReference -- ignorado.`);
      return;
    }

    const existing = await this.prisma.subscriptionPayment.findUnique({
      where: { externalPaymentId: payment.id },
    });
    if (existing) {
      this.logger.log(`Pagamento Mercado Pago ${payment.id} ja processado -- ignorando duplicata.`);
      return;
    }

    const tenantId = payment.externalReference;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Re-le a assinatura DENTRO da transacao (nao reaproveita nenhuma
        // variavel lida antes) -- reduz a janela de nextDueDate desatualizado
        // entre a checagem de duplicata acima e a escrita real a apenas o
        // tempo da propria transacao, nunca o request inteiro.
        const subscription = await tx.tenantSubscription.findUnique({ where: { tenantId } });
        if (!subscription) {
          this.logger.warn(`Pagamento Mercado Pago ${payment.id} referencia tenant desconhecido (${tenantId}).`);
          return;
        }

        await this.subscriptionsService.recordPaymentInTransaction(tx, subscription, {
          amount: payment.transactionAmount,
          dueDate: subscription.nextDueDate,
          paidAt: new Date(),
          paymentMethod: 'MERCADO_PAGO',
          status: 'PAID',
          createdBy: null,
          externalPaymentId: payment.id,
        });
      });
    } catch (error) {
      // Corrida entre duas entregas quase simultaneas do mesmo webhook: a
      // constraint @unique em externalPaymentId (Task 1) e a barreira real
      // no banco -- o findUnique acima pode nao pegar a outra escrita ainda
      // em voo, mas o banco nunca deixa duas linhas com o mesmo
      // externalPaymentId.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.log(`Pagamento Mercado Pago ${payment.id} ja processado (corrida concorrente) -- ignorado.`);
        return;
      }
      throw error;
    }

    this.logger.log(`Pagamento Mercado Pago ${payment.id} registrado para o tenant ${tenantId}.`);
  }
}
