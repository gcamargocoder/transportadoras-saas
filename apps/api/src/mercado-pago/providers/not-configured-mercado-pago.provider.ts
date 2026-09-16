import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CreatePreapprovalInput,
  MercadoPagoPayment,
  MercadoPagoPreapproval,
  MercadoPagoProviderPort,
} from './mercado-pago-provider.interface';

// Mesma logica de NotConfiguredRoutingProvider (Fase 26): nunca simula uma
// resposta do Mercado Pago. Usado quando MERCADO_PAGO_ACCESS_TOKEN nao esta
// configurado -- o resto do billing (fluxo manual) continua funcionando.
@Injectable()
export class NotConfiguredMercadoPagoProvider implements MercadoPagoProviderPort {
  isConfigured(): boolean {
    return false;
  }

  async createPreapproval(_input: CreatePreapprovalInput): Promise<MercadoPagoPreapproval> {
    throw this.error();
  }

  async getPreapproval(_id: string): Promise<MercadoPagoPreapproval> {
    throw this.error();
  }

  async getPayment(_id: string): Promise<MercadoPagoPayment> {
    throw this.error();
  }

  private error(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'Gateway de pagamento Mercado Pago nao configurado nesta instalacao (MERCADO_PAGO_ACCESS_TOKEN ausente).',
    );
  }
}
