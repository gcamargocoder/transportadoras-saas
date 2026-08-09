// Abstracao de provider de roteirizacao (Fase 26) -- o dominio (RoutingService)
// so conhece esta interface, nunca Google/HERE/Mapbox diretamente. Trocar de
// provider no futuro significa escrever uma nova classe que implemente isto
// e trocar o binding em routing.module.ts, sem tocar em RoutingService nem
// nos controllers.
export interface RouteWaypoint {
  /** Texto (endereco/nome), sempre presente -- usado para exibicao/auditoria. */
  label: string;
  /**
   * Quando presentes, o provider recebe coordenadas exatas (ex: ultima
   * posicao de GPS no recalculo) em vez de geocodificar `label` -- mais
   * preciso e nunca ambiguo. Quando ausentes, o provider geocodifica `label`
   * (ex: endereco cadastrado do Location de origem/destino).
   */
  latitude?: number;
  longitude?: number;
}

export interface CalculateRouteInput {
  origin: RouteWaypoint;
  destination: RouteWaypoint;
  /** Quando true, o provider pode devolver mais de uma rota (ate 3, tipicamente). */
  computeAlternatives: boolean;
}

export interface CalculatedRoute {
  originLabel: string;
  destinationLabel: string;
  originLatitude: number;
  originLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  distanceMeters: number;
  durationSeconds: number;
  /** Formato "encoded polyline" (algoritmo publico do Google, reutilizavel por qualquer provider). */
  encodedPolyline: string;
  /** Id da rota no provider, quando ele expuser um. */
  providerRouteId: string | null;
  /** O provider sinalizou que a rota tem pedagio(s). */
  hasTolls: boolean;
  /**
   * Valor agregado estimado de pedagio devolvido PELO PROVIDER (nao por praca
   * individual) -- usado como fallback quando nenhuma TollPlaza do catalogo
   * casa com a geometria da rota (ver RouteTollEstimateSource.PROVIDER_AGGREGATE).
   */
  estimatedTollAmount: number | null;
  estimatedTollCurrency: string | null;
}

export interface RoutingProviderPort {
  readonly providerName: string;
  isConfigured(): boolean;
  calculateRoutes(input: CalculateRouteInput): Promise<CalculatedRoute[]>;
}
