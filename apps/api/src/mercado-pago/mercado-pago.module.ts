import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { MERCADO_PAGO_PROVIDER } from './mercado-pago.constants';
import { MercadoPagoHttpProvider } from './providers/mercado-pago-http.provider';
import { MercadoPagoProviderPort } from './providers/mercado-pago-provider.interface';
import { NotConfiguredMercadoPagoProvider } from './providers/not-configured-mercado-pago.provider';
import { MercadoPagoService } from './services/mercado-pago.service';

// Modulo isolado (mesmo padrao de RoutingModule, Fase 26): o binding do
// token MERCADO_PAGO_PROVIDER decide em runtime, uma unica vez no boot, qual
// implementacao esta ativa -- MercadoPagoHttpProvider quando
// MERCADO_PAGO_ACCESS_TOKEN esta configurada, senao
// NotConfiguredMercadoPagoProvider (nunca simula dados). So MercadoPagoService
// e exportado -- nenhum outro modulo injeta o provider diretamente.
@Module({
  providers: [
    MercadoPagoService,
    MercadoPagoHttpProvider,
    NotConfiguredMercadoPagoProvider,
    {
      provide: MERCADO_PAGO_PROVIDER,
      useFactory: (
        configService: ConfigService<AppConfig, true>,
        http: MercadoPagoHttpProvider,
        notConfigured: NotConfiguredMercadoPagoProvider,
      ): MercadoPagoProviderPort =>
        configService.get('mercadoPago', { infer: true }).accessToken ? http : notConfigured,
      inject: [ConfigService, MercadoPagoHttpProvider, NotConfiguredMercadoPagoProvider],
    },
  ],
  exports: [MercadoPagoService],
})
export class MercadoPagoModule {}
