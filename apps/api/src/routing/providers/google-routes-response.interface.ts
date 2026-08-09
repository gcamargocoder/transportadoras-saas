// Subconjunto minimo da resposta da Google Routes API (computeRoutes) que
// esta implementacao realmente le -- ver
// https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
// Campos nao usados (steps detalhados, viewport, warnings...) ficam de fora
// de proposito -- so pedimos o necessario via X-Goog-FieldMask.
export interface GoogleMoney {
  currencyCode: string;
  units?: string;
  nanos?: number;
}

export interface GoogleTollInfo {
  estimatedPrice?: GoogleMoney[];
}

export interface GoogleRoute {
  distanceMeters?: number;
  /** Formato protobuf Duration serializado, ex: "1234s". */
  duration?: string;
  polyline?: { encodedPolyline?: string };
  travelAdvisory?: { tollInfo?: GoogleTollInfo };
}

export interface GoogleComputeRoutesResponse {
  routes?: GoogleRoute[];
}

export interface GoogleComputeRoutesErrorResponse {
  error?: { code?: number; message?: string; status?: string };
}
