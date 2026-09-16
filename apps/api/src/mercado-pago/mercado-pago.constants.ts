// Token de injecao para MercadoPagoProviderPort -- interfaces TS nao existem
// em runtime, entao o binding concreto (MercadoPagoHttpProvider ou
// NotConfiguredMercadoPagoProvider) e feito por este token em
// mercado-pago.module.ts. Mesmo padrao de ROUTING_PROVIDER (Fase 26).
export const MERCADO_PAGO_PROVIDER = 'MERCADO_PAGO_PROVIDER';
