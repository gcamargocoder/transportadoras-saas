// Abstracao do provider de pagamento Mercado Pago -- o dominio
// (SubscriptionsService/MercadoPagoWebhookService) so conhece
// MercadoPagoService (o wrapper exportado pelo modulo), nunca este provider
// diretamente. Mesmo padrao de RoutingProviderPort (Fase 26): trocar de
// implementacao = trocar o binding do token MERCADO_PAGO_PROVIDER em
// mercado-pago.module.ts.
export interface CreatePreapprovalInput {
  reason: string;
  payerEmail: string;
  externalReference: string;
  transactionAmount: number;
  frequency: number;
  frequencyType: 'months';
  startDate: Date;
  backUrl: string;
}

export interface MercadoPagoPreapproval {
  id: string;
  /** Valor cru do Mercado Pago: 'pending' | 'authorized' | 'paused' | 'cancelled'. */
  status: string;
  payerId: string | null;
  externalReference: string | null;
  /** So preenchido pela resposta de criacao (link do checkout de autorizacao). */
  initPoint: string | null;
}

export interface MercadoPagoPayment {
  id: string;
  /** Valor cru do Mercado Pago: 'approved' | 'pending' | 'rejected' | ... */
  status: string;
  externalReference: string | null;
  transactionAmount: number;
}

export interface MercadoPagoProviderPort {
  isConfigured(): boolean;
  createPreapproval(input: CreatePreapprovalInput): Promise<MercadoPagoPreapproval>;
  getPreapproval(id: string): Promise<MercadoPagoPreapproval>;
  getPayment(id: string): Promise<MercadoPagoPayment>;
}
