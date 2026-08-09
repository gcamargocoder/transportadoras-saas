import { ServiceUnavailableException } from '@nestjs/common';
import { decodePolyline } from '../utils/polyline.util';
import { CalculateRouteInput, CalculatedRoute } from './routing-provider.interface';
import { GoogleComputeRoutesResponse, GoogleMoney, GoogleRoute } from './google-routes-response.interface';

// Parsing puro (sem HTTP) da resposta da Google Routes API -- separado do
// GoogleRoutingProvider para ser testavel com fixtures, sem precisar mockar
// fetch/rede (ver google-route-parser.util.spec.ts).
export function parseGoogleRoutesResponse(
  input: CalculateRouteInput,
  response: GoogleComputeRoutesResponse,
): CalculatedRoute[] {
  if (!response.routes || response.routes.length === 0) {
    return [];
  }
  return response.routes.map((route) => parseGoogleRoute(input, route));
}

function parseGoogleRoute(input: CalculateRouteInput, route: GoogleRoute): CalculatedRoute {
  const encodedPolyline = route.polyline?.encodedPolyline ?? '';
  const points = decodePolyline(encodedPolyline);
  const originPoint = points[0];
  const destinationPoint = points[points.length - 1];
  if (!originPoint || !destinationPoint) {
    throw new ServiceUnavailableException(
      'Resposta do provider de rotas (Google Routes API) sem geometria valida.',
    );
  }

  const tollInfo = route.travelAdvisory?.tollInfo;
  const estimatedPrice = tollInfo?.estimatedPrice?.[0];

  return {
    originLabel: input.origin.label,
    destinationLabel: input.destination.label,
    originLatitude: originPoint.latitude,
    originLongitude: originPoint.longitude,
    destinationLatitude: destinationPoint.latitude,
    destinationLongitude: destinationPoint.longitude,
    distanceMeters: route.distanceMeters ?? 0,
    durationSeconds: parseGoogleDurationSeconds(route.duration),
    encodedPolyline,
    providerRouteId: null,
    hasTolls: Boolean(tollInfo),
    estimatedTollAmount: estimatedPrice ? googleMoneyToNumber(estimatedPrice) : null,
    estimatedTollCurrency: estimatedPrice?.currencyCode ?? null,
  };
}

// Duration do protobuf serializada como string "1234s" ou "1234.500s".
export function parseGoogleDurationSeconds(duration: string | undefined): number {
  if (!duration) return 0;
  const seconds = Number.parseFloat(duration.replace(/s$/i, ''));
  return Number.isFinite(seconds) ? Math.round(seconds) : 0;
}

// Money do Google: unidades inteiras (string, para nao perder precisao em
// valores grandes) + nanos (fracao, 1e-9). Ver
// https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes#money
export function googleMoneyToNumber(money: GoogleMoney): number {
  const units = money.units ? Number.parseInt(money.units, 10) : 0;
  const nanos = money.nanos ?? 0;
  return Math.round((units + nanos / 1e9) * 100) / 100;
}
