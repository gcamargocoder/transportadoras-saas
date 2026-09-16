import { Inject, Injectable } from '@nestjs/common';
import { MERCADO_PAGO_PROVIDER } from '../mercado-pago.constants';
import {
  CreatePreapprovalInput,
  MercadoPagoPayment,
  MercadoPagoPreapproval,
  MercadoPagoProviderPort,
} from '../providers/mercado-pago-provider.interface';

// Wrapper fino sobre MercadoPagoProviderPort -- unico ponto exportado pelo
// MercadoPagoModule (mesmo padrao de RoutingService/RoutingProviderPort,
// Fase 26). Outros modulos injetam MercadoPagoService, nunca o provider.
@Injectable()
export class MercadoPagoService {
  constructor(@Inject(MERCADO_PAGO_PROVIDER) private readonly provider: MercadoPagoProviderPort) {}

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  createPreapproval(input: CreatePreapprovalInput): Promise<MercadoPagoPreapproval> {
    return this.provider.createPreapproval(input);
  }

  getPreapproval(id: string): Promise<MercadoPagoPreapproval> {
    return this.provider.getPreapproval(id);
  }

  getPayment(id: string): Promise<MercadoPagoPayment> {
    return this.provider.getPayment(id);
  }
}
