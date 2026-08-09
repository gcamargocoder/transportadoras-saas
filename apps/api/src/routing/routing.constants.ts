// Token de injecao para RoutingProviderPort -- interfaces TS nao existem em
// runtime, entao o binding concreto (GoogleRoutingProvider hoje) e feito por
// este token em routing.module.ts. Trocar de provider = trocar o `useClass`
// deste token, nada mais.
export const ROUTING_PROVIDER = 'ROUTING_PROVIDER';
