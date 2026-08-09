import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CalculateRouteInput, CalculatedRoute, RoutingProviderPort } from './routing-provider.interface';

// Provider "nulo" -- nunca simula uma rota. Usado quando nenhuma
// credencial de provider externo esta configurada no ambiente (ver
// routing.module.ts): a aplicacao sobe normalmente e o resto do sistema
// funciona, mas qualquer tentativa de calcular rota recebe um erro claro em
// vez de dados inventados (regra explicita da Fase 26: "nao fingir que
// dados reais foram obtidos").
@Injectable()
export class NotConfiguredRoutingProvider implements RoutingProviderPort {
  readonly providerName = 'NONE';

  isConfigured(): boolean {
    return false;
  }

  // async de proposito (mesmo sem await interno): garante que o erro sempre
  // chega como promise rejeitada, nunca como excecao sincrona -- callers
  // podem tratar todo RoutingProviderPort de forma uniforme com try/await.
  async calculateRoutes(_input: CalculateRouteInput): Promise<CalculatedRoute[]> {
    throw new ServiceUnavailableException(
      'Provider de roteirizacao nao configurado nesta instalacao (GOOGLE_ROUTES_API_KEY ausente). ' +
        'A arquitetura de roteirizacao esta pronta; configure a chave para habilitar o calculo de rotas.',
    );
  }
}
