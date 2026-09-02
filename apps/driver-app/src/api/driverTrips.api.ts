import { apiRequest, apiUpload, UploadFilePart } from './http';
import {
  AxleEvent,
  AxleEventSource,
  CreateOccurrenceInput,
  DeliveryProof,
  DriverActiveTrip,
  DriverConfig,
  DriverIdlePeriod,
  DriverRoute,
  DriverShift,
  DriverTrip,
  FuelSupply,
  FuelType,
  NearbyTollPlaza,
  OccurrenceEvidence,
  RouteComparison,
  SubmitDeliveryProofInput,
  SubmitOccurrenceEvidenceInput,
  TrackingPointInput,
  TrackingPointsSyncResult,
  TripDeliveryStop,
  TripDeliveryStopStatus,
  TripEtaResult,
  TripLoadStatus,
  TripOccurrence,
  TripStop,
  TripStopType,
  VehicleIdleReason,
} from './driverTrips.types';

export function getConfig(): Promise<DriverConfig> {
  return apiRequest<DriverConfig>('/driver/config');
}

export function getActiveTrip(): Promise<DriverActiveTrip | null> {
  return apiRequest<DriverActiveTrip | null>('/driver/trips/active');
}

export function getTrip(tripId: string): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}`);
}

// Fase 27 -- tela "INICIAR VIAGEM": KM/carga sao opcionais no contrato HTTP
// (compatibilidade com chamadas antigas sem corpo), mas a tela sempre envia
// os dois quando o motorista preenche o formulario de largada.
export function startTrip(
  tripId: string,
  input?: { odometerKm?: number; loadStatus?: TripLoadStatus },
): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/start`, {
    method: 'POST',
    body: input ?? {},
  });
}

// Fase 28 -- posicao GPS opcional (o motorista pode estar sem sinal no
// momento da pausa/retomada); quando informada, o backend registra como um
// TrackingPoint normal (reavalia desvio de rota na retomada automaticamente).
export function pauseTrip(
  tripId: string,
  position?: { latitude: number; longitude: number },
): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/pause`, {
    method: 'POST',
    body: position ?? {},
  });
}

export function resumeTrip(
  tripId: string,
  position?: { latitude: number; longitude: number },
): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/resume`, {
    method: 'POST',
    body: position ?? {},
  });
}

// Fase 28 -- tela "FINALIZAR VIAGEM": KM final opcional no contrato HTTP
// (mesmo principio da Fase 27), mas a tela sempre envia quando o motorista
// preenche o formulario de encerramento.
export function completeTrip(
  tripId: string,
  input?: { finalOdometerKm?: number; latitude?: number; longitude?: number; idleReason?: VehicleIdleReason },
): Promise<DriverTrip> {
  return apiRequest<DriverTrip>(`/driver/trips/${tripId}/complete`, {
    method: 'POST',
    body: input ?? {},
  });
}

// Fase C -- periodo ocioso ABERTO do veiculo que este motorista acabou de
// operar (ou null). Datas/duracao sempre do backend.
export function getCurrentIdlePeriod(): Promise<DriverIdlePeriod | null> {
  return apiRequest<DriverIdlePeriod | null>('/driver/idle-period', { method: 'GET' });
}

// Fase C -- o motorista informa/corrige o MOTIVO do periodo ocioso aberto.
// SEMPRE 200; devolve null (no-op) quando nao ha periodo aberto (proxima
// viagem ja iniciou). NUNCA envia duracao/datas.
export function setIdleReason(reason: VehicleIdleReason): Promise<DriverIdlePeriod | null> {
  return apiRequest<DriverIdlePeriod | null>('/driver/idle-period', {
    method: 'PATCH',
    body: { reason },
  });
}

export function sendLocations(
  tripId: string,
  points: TrackingPointInput[],
): Promise<TrackingPointsSyncResult> {
  return apiRequest<TrackingPointsSyncResult>(`/driver/trips/${tripId}/locations`, {
    method: 'POST',
    body: { points },
  });
}

export function getNearbyTollPlazas(
  tripId: string,
  lat: number,
  lng: number,
): Promise<NearbyTollPlaza[]> {
  return apiRequest<NearbyTollPlaza[]>(`/driver/trips/${tripId}/nearby-toll-plazas`, {
    query: { lat, lng },
  });
}

export function openStop(
  tripId: string,
  input: { deviceEventId: string; type?: TripStopType; latitude: number; longitude: number; startedAt: string },
): Promise<TripStop> {
  return apiRequest<TripStop>(`/driver/trips/${tripId}/stops`, { method: 'POST', body: input });
}

export function closeStop(
  tripId: string,
  stopId: string,
  input: { endedAt: string; type?: TripStopType; locationLabel?: string },
): Promise<TripStop> {
  return apiRequest<TripStop>(`/driver/trips/${tripId}/stops/${stopId}/close`, {
    method: 'PATCH',
    body: input,
  });
}

// Fase 43 -- fecha pelo deviceEventId usado na ABERTURA (nao pelo id do
// servidor), unica forma de a fila offline (syncQueue.ts) enfileirar um
// fechamento sem depender de ja ter recebido resposta da abertura.
export function closeStopByDeviceEvent(
  tripId: string,
  input: { deviceEventId: string; endedAt: string; type?: TripStopType; locationLabel?: string },
): Promise<TripStop> {
  return apiRequest<TripStop>(`/driver/trips/${tripId}/stops/close-by-device-event`, {
    method: 'POST',
    body: input,
  });
}

export function getStops(tripId: string): Promise<TripStop[]> {
  return apiRequest<TripStop[]>(`/driver/trips/${tripId}/stops`);
}

// Fase 88 -- paradas/entregas PLANEJADAS da viagem, em ordem de sequencia.
// Somente leitura (ver comentario em driverTrips.types.ts).
export function getDeliveryStops(tripId: string): Promise<TripDeliveryStop[]> {
  return apiRequest<TripDeliveryStop[]>(`/driver/trips/${tripId}/delivery-stops`);
}

// Fase 91 -- previsao de chegada (ETA) do destino final e de cada parada,
// sempre calculada sob demanda pelo backend (nunca persistida).
export function getEta(tripId: string): Promise<TripEtaResult> {
  return apiRequest<TripEtaResult>(`/driver/trips/${tripId}/delivery-stops/eta`);
}

// Fase 106 -- transicao de status pelo motorista (mesma regra/servico do
// painel administrativo, so o RBAC/ownership muda). Idempotente por ESTADO
// (mesmo principio de pauseTrip/resumeTrip/completeTrip) -- reenviar a
// mesma transicao apos reconexao nunca duplica.
export function updateDeliveryStopStatus(
  tripId: string,
  stopId: string,
  input: { status: TripDeliveryStopStatus; reason?: string },
): Promise<TripDeliveryStop> {
  return apiRequest<TripDeliveryStop>(`/driver/trips/${tripId}/delivery-stops/${stopId}/status`, {
    method: 'PATCH',
    body: input,
  });
}

export function createFuelSupply(
  tripId: string,
  input: {
    deviceEventId: string;
    odometerKm: number;
    liters: number;
    fuelType?: FuelType;
    pricePerLiter?: number;
    latitude?: number;
    longitude?: number;
  },
): Promise<FuelSupply> {
  return apiRequest<FuelSupply>(`/driver/trips/${tripId}/fuel-supplies`, {
    method: 'POST',
    body: input,
  });
}

export function openAxleEvent(
  tripId: string,
  input: {
    deviceEventId: string;
    tollPlazaId?: string;
    declaredAxles?: number;
    source: AxleEventSource;
    latitude: number;
    longitude: number;
  },
): Promise<AxleEvent> {
  return apiRequest<AxleEvent>(`/driver/trips/${tripId}/axle-events`, {
    method: 'POST',
    body: input,
  });
}

export function closeAxleEvent(
  tripId: string,
  eventId: string,
  endedAt: string,
): Promise<AxleEvent> {
  return apiRequest<AxleEvent>(`/driver/trips/${tripId}/axle-events/${eventId}/close`, {
    method: 'PATCH',
    body: { endedAt },
  });
}

// Fase 56 -- comprovante de entrega. `file` e o path local persistido
// (ver storage/deliveryProofFiles.ts) -- nunca a URI efemera da camera
// direto (mesmo motivo/padrao de uploadChecklistEvidence).
export function submitDeliveryProof(
  tripId: string,
  input: SubmitDeliveryProofInput,
  file: UploadFilePart,
): Promise<DeliveryProof> {
  const fields: Record<string, string | undefined> = {
    deviceEventId: input.deviceEventId,
    tripDeliveryStopId: input.tripDeliveryStopId,
    observation: input.observation,
    capturedAt: input.capturedAt,
  };
  return apiUpload<DeliveryProof>(`/driver/trips/${tripId}/delivery-proof`, fields, file);
}

// ==========================================================================
// OCORRENCIAS (Fase 67) -- idempotente por deviceEventId, mesmo padrao de
// stop-open/fuel-supply/axle-event-open.
// ==========================================================================

export function createOccurrence(tripId: string, input: CreateOccurrenceInput): Promise<TripOccurrence> {
  return apiRequest<TripOccurrence>(`/driver/trips/${tripId}/occurrences`, {
    method: 'POST',
    body: input,
  });
}

export function getOccurrences(tripId: string): Promise<TripOccurrence[]> {
  return apiRequest<TripOccurrence[]>(`/driver/trips/${tripId}/occurrences`);
}

// Fase 102 -- documento/evidencia de uma ocorrencia. Mesmo mecanismo
// generico de FiscalDocument ja usado por submitDeliveryProof acima --
// nenhum storage paralelo. `file` e o path local persistido, mesmo padrao
// de submitDeliveryProof.
export function submitOccurrenceEvidence(
  tripId: string,
  occurrenceId: string,
  input: SubmitOccurrenceEvidenceInput,
  file: UploadFilePart,
): Promise<OccurrenceEvidence> {
  const fields: Record<string, string | undefined> = {
    deviceEventId: input.deviceEventId,
    observation: input.observation,
    capturedAt: input.capturedAt,
  };
  return apiUpload<OccurrenceEvidence>(`/driver/trips/${tripId}/occurrences/${occurrenceId}/evidence`, fields, file);
}

// ==========================================================================
// JORNADA (Fase 67) -- idempotente por ESTADO no backend (nunca por
// deviceEventId, ver comentario em syncQueue.ts).
// ==========================================================================

export function getActiveShift(): Promise<DriverShift | null> {
  return apiRequest<DriverShift | null>('/driver/shifts/active');
}

export function startShift(tripId?: string): Promise<DriverShift> {
  return apiRequest<DriverShift>('/driver/shifts/start', {
    method: 'POST',
    body: tripId ? { tripId } : {},
  });
}

export function endShift(shiftId: string): Promise<DriverShift> {
  return apiRequest<DriverShift>(`/driver/shifts/${shiftId}/end`, { method: 'POST' });
}

export function cancelShift(shiftId: string): Promise<DriverShift> {
  return apiRequest<DriverShift>(`/driver/shifts/${shiftId}/cancel`, { method: 'POST' });
}

export function startShiftBreak(shiftId: string, type?: TripStopType): Promise<DriverShift> {
  return apiRequest<DriverShift>(`/driver/shifts/${shiftId}/breaks`, {
    method: 'POST',
    body: type ? { type } : {},
  });
}

export function endShiftBreak(shiftId: string): Promise<DriverShift> {
  return apiRequest<DriverShift>(`/driver/shifts/${shiftId}/breaks/end`, { method: 'POST' });
}

// Fase 26 -- roteirizacao geografica.
export function getRoute(tripId: string): Promise<DriverRoute | null> {
  return apiRequest<DriverRoute | null>(`/driver/trips/${tripId}/route`);
}

export function recalculateRoute(tripId: string): Promise<{
  previous: unknown;
  next: unknown;
  difference: RouteComparison | null;
}> {
  return apiRequest(`/driver/trips/${tripId}/route/recalculate`, { method: 'POST' });
}
