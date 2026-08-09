import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { parseGoogleRoutesResponse } from './google-route-parser.util';
import { GoogleComputeRoutesErrorResponse, GoogleComputeRoutesResponse } from './google-routes-response.interface';
import { CalculateRouteInput, CalculatedRoute, RouteWaypoint, RoutingProviderPort } from './routing-provider.interface';

// Coordenadas exatas (recalculo a partir do GPS) tem prioridade sobre o
// texto -- nunca geocodifica um label quando ja sabemos a posicao exata.
function toGoogleWaypoint(waypoint: RouteWaypoint): Record<string, unknown> {
  if (waypoint.latitude !== undefined && waypoint.longitude !== undefined) {
    return { location: { latLng: { latitude: waypoint.latitude, longitude: waypoint.longitude } } };
  }
  return { address: waypoint.label };
}

const COMPUTE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

// Campos pedidos explicitamente via X-Goog-FieldMask (a Routes API exige
// isso -- sem field mask, a resposta vem vazia). So os campos que
// parseGoogleRoutesResponse realmente le.
const FIELD_MASK = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.travelAdvisory.tollInfo',
].join(',');

// Implementacao concreta de RoutingProviderPort para a Google Routes API
// (computeRoutes). Usa fetch nativo do Node (disponivel desde o Node 18) --
// nao adiciona nenhuma dependencia nova so para isto. Nunca loga a API key.
//
// LIMITACAO CONHECIDA (documentada tambem no schema, ver RoutePlanToll): a
// Routes API publica nao devolve uma lista nomeada e confiavel de pracas de
// pedagio individuais com coordenadas -- so geometria da rota + (quando
// extraComputations=[TOLLS]) um valor agregado estimado. Por isso a
// descoberta de pracas nesta fase cruza a geometria devolvida aqui com o
// catalogo interno de TollPlaza (ver RoutingService + toll-matching.util.ts),
// em vez de tentar casar "pracas do provider" com o catalogo.
@Injectable()
export class GoogleRoutingProvider implements RoutingProviderPort {
  readonly providerName = 'GOOGLE';
  private readonly logger = new Logger(GoogleRoutingProvider.name);

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get('routing', { infer: true }).googleRoutesApiKey);
  }

  async calculateRoutes(input: CalculateRouteInput): Promise<CalculatedRoute[]> {
    const routingConfig = this.configService.get('routing', { infer: true });
    const apiKey = routingConfig.googleRoutesApiKey;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Provider de roteirizacao (Google Routes API) nao configurado (GOOGLE_ROUTES_API_KEY ausente).',
      );
    }

    const requestBody = {
      origin: toGoogleWaypoint(input.origin),
      destination: toGoogleWaypoint(input.destination),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      computeAlternativeRoutes: input.computeAlternatives,
      extraComputations: ['TOLLS'],
      languageCode: 'pt-BR',
      units: 'METRIC',
    };

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), routingConfig.requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(COMPUTE_ROUTES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.error(
        `Falha de rede ao chamar Google Routes API: ${error instanceof Error ? error.message : error}`,
      );
      throw new ServiceUnavailableException('Nao foi possivel contatar o provider de rotas.');
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as GoogleComputeRoutesErrorResponse | null;
      // Nunca repassa o corpo bruto do erro do Google ao cliente (pode conter
      // detalhes de configuracao da chave) -- so loga internamente.
      this.logger.error(
        `Google Routes API respondeu ${response.status}: ${errorBody?.error?.message ?? 'sem detalhes'}`,
      );
      throw new ServiceUnavailableException('O provider de rotas retornou um erro ao calcular a rota.');
    }

    const json = (await response.json()) as GoogleComputeRoutesResponse;
    const routes = parseGoogleRoutesResponse(input, json);
    if (routes.length === 0) {
      throw new NotFoundException('Nenhuma rota encontrada entre a origem e o destino informados.');
    }
    return routes;
  }
}
