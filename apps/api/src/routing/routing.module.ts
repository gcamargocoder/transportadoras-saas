import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { RoutePlanController } from './controllers/route-plan.controller';
import { GoogleRoutingProvider } from './providers/google.provider';
import { NotConfiguredRoutingProvider } from './providers/not-configured.provider';
import { RoutingProviderPort } from './providers/routing-provider.interface';
import { ROUTING_PROVIDER } from './routing.constants';
import { RoutingService } from './services/routing.service';

// Modulo isolado de roteirizacao geografica (Fase 26). So depende de
// PrismaService/AuditService/ConfigService (todos globais) -- nenhuma
// dependencia de TripsModule/TripOperationsModule/DriverTripsModule, para
// que ambos possam importar RoutingModule livremente sem criar ciclo (mesmo
// padrao ja usado por TripOperationsModule na Fase 25).
//
// O binding do token ROUTING_PROVIDER decide em runtime, uma unica vez no
// boot, qual implementacao concreta esta ativa: GoogleRoutingProvider
// quando GOOGLE_ROUTES_API_KEY esta configurada, senao
// NotConfiguredRoutingProvider (nunca simula dados). Trocar de provider no
// futuro (HERE/Mapbox/ORS) = adicionar uma nova classe + um novo `case`
// aqui, sem tocar em RoutingService nem nos controllers.
@Module({
  controllers: [RoutePlanController],
  providers: [
    RoutingService,
    GoogleRoutingProvider,
    NotConfiguredRoutingProvider,
    {
      provide: ROUTING_PROVIDER,
      useFactory: (
        configService: ConfigService<AppConfig, true>,
        google: GoogleRoutingProvider,
        notConfigured: NotConfiguredRoutingProvider,
      ): RoutingProviderPort =>
        configService.get('routing', { infer: true }).googleRoutesApiKey ? google : notConfigured,
      inject: [ConfigService, GoogleRoutingProvider, NotConfiguredRoutingProvider],
    },
  ],
  exports: [RoutingService],
})
export class RoutingModule {}
