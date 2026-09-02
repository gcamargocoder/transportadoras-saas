import AsyncStorage from '@react-native-async-storage/async-storage';
import * as driverChecklistApi from '../api/driverChecklist.api';
import { ChecklistAnswerInput, ChecklistEvidenceType } from '../api/driverChecklist.types';
import * as driverTripsApi from '../api/driverTrips.api';
import {
  AxleEventSource,
  FuelType,
  TrackingPointInput,
  TripDeliveryStopStatus,
  TripOccurrenceSeverity,
  TripOccurrenceType,
  TripStopType,
  VehicleIdleReason,
} from '../api/driverTrips.types';
import { compact } from '../utils/compact';

// Fila offline (Fase 25, secao 17/18) -- eventos de CRIACAO gerados pelo app
// (localizacao, abertura de parada, abastecimento, abertura de excecao de
// eixo) sao sempre tentados imediatamente; se a rede falhar, ficam aqui ate a
// proxima chamada a flush() (reconexao). Idempotentes por deviceEventId no
// backend -- reenviar nunca duplica. Fechamento de eixo continua fora desta
// fila (mesma limitacao original: depende do id gerado pelo servidor na
// abertura). Fechamento de PARADA (Fase 43) passou a caber aqui via
// 'stop-close', que fecha pelo deviceEventId USADO NA ABERTURA (rota POST
// stops/close-by-device-event) -- nao pelo id do servidor, entao funciona
// mesmo quando a propria abertura ainda esta pendente nesta fila.
type PendingAction =
  | { kind: 'locations'; tripId: string; points: TrackingPointInput[] }
  | {
      kind: 'stop-open';
      tripId: string;
      deviceEventId: string;
      type?: TripStopType;
      latitude: number;
      longitude: number;
      startedAt: string;
    }
  | {
      kind: 'stop-close';
      tripId: string;
      deviceEventId: string;
      endedAt: string;
      type?: TripStopType;
    }
  | {
      kind: 'fuel-supply';
      tripId: string;
      deviceEventId: string;
      odometerKm: number;
      liters: number;
      fuelType?: FuelType;
      pricePerLiter?: number;
      latitude?: number;
      longitude?: number;
    }
  | {
      kind: 'axle-event-open';
      tripId: string;
      deviceEventId: string;
      tollPlazaId?: string;
      declaredAxles?: number;
      source: AxleEventSource;
      latitude: number;
      longitude: number;
    }
  // Fase 30, secao 10/11 -- pausa/retomada/finalizacao tambem sao eventos
  // "gerados pelo app" e precisam sobreviver a falta de internet (secao 11
  // exige explicitamente reaproveitar esta MESMA fila, nao uma nova). Ja sao
  // idempotentes no backend por ESTADO (pausar 2x so aplica PAUSED->PAUSED,
  // nunca por deviceEventId) -- nao precisam de um id de deduplicacao.
  | { kind: 'pause'; tripId: string; latitude?: number; longitude?: number }
  | { kind: 'resume'; tripId: string; latitude?: number; longitude?: number }
  // Fase C -- `idleReason` opcional: motivo da parada do veiculo APOS a
  // viagem, aplicado ao VehicleIdlePeriod que o backend abre ao concluir
  // (nunca cria um 2o periodo). Vai junto na MESMA acao 'complete' (nao ha
  // problema de ordem: uma unica chamada HTTP conclui + aplica o motivo).
  | {
      kind: 'complete';
      tripId: string;
      finalOdometerKm?: number;
      latitude?: number;
      longitude?: number;
      idleReason?: VehicleIdleReason;
    }
  // Fase C -- o motorista informa/corrige o MOTIVO da parada DEPOIS, na tela
  // pos-viagem (veiculo ja parado, periodo ja aberto pela Fase B). Idempotente
  // por ESTADO no backend (mesmo principio de pause/resume/complete) -- nunca
  // precisa de deviceEventId, definir o mesmo motivo 2x tem o mesmo efeito.
  // O backend responde SEMPRE 200 (null quando nao ha periodo aberto) -- a
  // acao nunca fica presa em retry.
  | { kind: 'idle-reason'; reason: VehicleIdleReason }
  // Fase 106 -- transicao de status de parada/entrega planejada pelo
  // motorista. Idempotente por ESTADO no backend (mesmo principio de pause/
  // resume/complete acima, ver TripDeliveryStopsService.updateStatus: status
  // repetido e no-op) -- nunca precisa de deviceEventId.
  | { kind: 'delivery-stop-status'; tripId: string; stopId: string; status: TripDeliveryStopStatus; reason?: string }
  // Fase 39 -- checklist operacional. A CRIACAO da execucao (POST
  // driver/checklists) NUNCA entra nesta fila: ela devolve o id gerado
  // pelo servidor, que as 3 acoes abaixo precisam na URL -- enfileirar a
  // criacao exigiria resolver uma dependencia encadeada que esta fila nao
  // modela (nenhum kind existente depende do resultado de outro). Por
  // isso a execucao so e criada com o app ONLINE; a partir dai, responder/
  // enviar evidencia/concluir reaproveitam esta fila normalmente (ver
  // docs/checklist-module.md).
  | { kind: 'checklist-answers'; executionId: string; answers: ChecklistAnswerInput[] }
  | { kind: 'checklist-complete'; executionId: string }
  | {
      kind: 'checklist-evidence';
      executionId: string;
      deviceEventId: string;
      type: ChecklistEvidenceType;
      // Associacao primaria com o item do template -- nunca depende de um
      // answerId (a resposta pode nem ter sido enviada ainda quando a foto
      // e capturada, ver schema.prisma ChecklistEvidence).
      itemId?: string;
      answerId?: string;
      description?: string;
      latitude?: number;
      longitude?: number;
      // Path local persistido (ver storage/evidenceFiles.ts) -- nunca a URI
      // efemera da camera/ImagePicker, que pode desaparecer do cache do SO
      // antes do flush acontecer.
      localFileUri: string;
      fileName: string;
      mimeType: string;
    }
  // Fase 56 -- comprovante de entrega. Mesmo principio de checklist-evidence
  // acima: localFileUri sempre o path persistido (ver storage/
  // deliveryProofFiles.ts), deviceEventId garante idempotencia no backend
  // (FiscalDocument.deviceEventId, unique) -- reenviar apos reconexao nunca
  // cria um segundo comprovante. Fase 106 -- tripDeliveryStopId opcional
  // (vinculo com a parada especifica, ja suportado pelo backend desde a
  // Fase 100/SubmitDeliveryProofDto; so nao era coletado por nenhuma tela
  // ate agora).
  | {
      kind: 'delivery-proof';
      tripId: string;
      deviceEventId: string;
      tripDeliveryStopId?: string;
      observation?: string;
      capturedAt: string;
      localFileUri: string;
      fileName: string;
      mimeType: string;
    }
  // Fase 67 -- ocorrencia registrada pelo motorista. Idempotente por
  // deviceEventId, mesmo padrao de stop-open/fuel-supply/axle-event-open.
  | {
      kind: 'occurrence-create';
      tripId: string;
      deviceEventId: string;
      type: TripOccurrenceType;
      severity?: TripOccurrenceSeverity;
      description: string;
      occurredAt: string;
      latitude?: number;
      longitude?: number;
    }
  // Fase 67 -- jornada do motorista. Idempotente por ESTADO no backend
  // (mesmo principio de pause/resume/complete acima) -- nunca por
  // deviceEventId, o schema de DriverShift/ShiftBreak nao tem esse campo.
  // 'shift-start' NAO entra nesta fila (mesmo motivo de checklist-create
  // abaixo: as acoes seguintes precisam do id gerado pelo servidor, que
  // esta fila nao resolve encadeado) -- e sempre tentado online antes de
  // habilitar pausa/retorno/encerramento na tela.
  | { kind: 'shift-end'; shiftId: string }
  | { kind: 'shift-cancel'; shiftId: string }
  | { kind: 'shift-break-start'; shiftId: string; type?: TripStopType }
  | { kind: 'shift-break-end'; shiftId: string };

const STORAGE_KEY = 'driverapp.syncQueue';

async function readQueue(): Promise<PendingAction[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingAction[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingAction[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

async function runAction(action: PendingAction): Promise<void> {
  switch (action.kind) {
    case 'locations':
      await driverTripsApi.sendLocations(action.tripId, action.points);
      return;
    case 'stop-open':
      await driverTripsApi.openStop(action.tripId, {
        deviceEventId: action.deviceEventId,
        latitude: action.latitude,
        longitude: action.longitude,
        startedAt: action.startedAt,
        ...compact({ type: action.type }),
      });
      return;
    case 'stop-close':
      await driverTripsApi.closeStopByDeviceEvent(action.tripId, {
        deviceEventId: action.deviceEventId,
        endedAt: action.endedAt,
        ...compact({ type: action.type }),
      });
      return;
    case 'fuel-supply':
      await driverTripsApi.createFuelSupply(action.tripId, {
        deviceEventId: action.deviceEventId,
        odometerKm: action.odometerKm,
        liters: action.liters,
        ...compact({
          fuelType: action.fuelType,
          pricePerLiter: action.pricePerLiter,
          latitude: action.latitude,
          longitude: action.longitude,
        }),
      });
      return;
    case 'axle-event-open':
      await driverTripsApi.openAxleEvent(action.tripId, {
        deviceEventId: action.deviceEventId,
        source: action.source,
        latitude: action.latitude,
        longitude: action.longitude,
        ...compact({ tollPlazaId: action.tollPlazaId, declaredAxles: action.declaredAxles }),
      });
      return;
    case 'pause':
      await driverTripsApi.pauseTrip(action.tripId, toPosition(action));
      return;
    case 'resume':
      await driverTripsApi.resumeTrip(action.tripId, toPosition(action));
      return;
    case 'complete':
      await driverTripsApi.completeTrip(action.tripId, {
        ...compact({
          finalOdometerKm: action.finalOdometerKm,
          latitude: action.latitude,
          longitude: action.longitude,
          idleReason: action.idleReason,
        }),
      });
      return;
    case 'idle-reason':
      await driverTripsApi.setIdleReason(action.reason);
      return;
    case 'delivery-stop-status':
      await driverTripsApi.updateDeliveryStopStatus(action.tripId, action.stopId, {
        status: action.status,
        ...compact({ reason: action.reason }),
      });
      return;
    case 'checklist-answers':
      await driverChecklistApi.submitChecklistAnswers(action.executionId, action.answers);
      return;
    case 'checklist-complete':
      await driverChecklistApi.completeChecklist(action.executionId);
      return;
    case 'checklist-evidence':
      await driverChecklistApi.uploadChecklistEvidence(
        action.executionId,
        {
          deviceEventId: action.deviceEventId,
          type: action.type,
          ...compact({
            itemId: action.itemId,
            answerId: action.answerId,
            description: action.description,
            latitude: action.latitude,
            longitude: action.longitude,
          }),
        },
        { uri: action.localFileUri, name: action.fileName, type: action.mimeType },
      );
      return;
    case 'delivery-proof':
      await driverTripsApi.submitDeliveryProof(
        action.tripId,
        {
          deviceEventId: action.deviceEventId,
          capturedAt: action.capturedAt,
          ...compact({ observation: action.observation, tripDeliveryStopId: action.tripDeliveryStopId }),
        },
        { uri: action.localFileUri, name: action.fileName, type: action.mimeType },
      );
      return;
    case 'occurrence-create':
      await driverTripsApi.createOccurrence(action.tripId, {
        deviceEventId: action.deviceEventId,
        type: action.type,
        description: action.description,
        occurredAt: action.occurredAt,
        ...compact({ severity: action.severity, latitude: action.latitude, longitude: action.longitude }),
      });
      return;
    case 'shift-end':
      await driverTripsApi.endShift(action.shiftId);
      return;
    case 'shift-cancel':
      await driverTripsApi.cancelShift(action.shiftId);
      return;
    case 'shift-break-start':
      await driverTripsApi.startShiftBreak(action.shiftId, action.type);
      return;
    case 'shift-break-end':
      await driverTripsApi.endShiftBreak(action.shiftId);
      return;
  }
}

// pauseTrip/resumeTrip exigem latitude+longitude JUNTOS (ou nenhum dos dois)
// -- a acao guarda os dois campos independentes (serializacao JSON simples),
// esta funcao so reconstroi o par quando ambos estao presentes.
function toPosition(action: {
  latitude?: number;
  longitude?: number;
}): { latitude: number; longitude: number } | undefined {
  return action.latitude !== undefined && action.longitude !== undefined
    ? { latitude: action.latitude, longitude: action.longitude }
    : undefined;
}

// Tenta executar a acao AGORA; se falhar (rede indisponivel), enfileira para
// tentar de novo depois -- nunca lanca para o chamador, o registro sempre
// "parece" ter sido aceito do ponto de vista do motorista (offline-first).
export async function submitOrQueue(action: PendingAction): Promise<{ queued: boolean }> {
  try {
    await runAction(action);
    return { queued: false };
  } catch {
    const queue = await readQueue();
    queue.push(action);
    await writeQueue(queue);
    return { queued: true };
  }
}

// Chamado ao reabrir o app / recuperar conectividade -- tenta reenviar tudo
// que ficou pendente, na ordem em que foi criado. Para no primeiro erro
// (provavelmente ainda sem rede) para nao reordenar eventos.
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  const queue = await readQueue();
  let sent = 0;
  while (queue.length > 0) {
    const next = queue[0]!;
    try {
      await runAction(next);
      queue.shift();
      sent += 1;
    } catch {
      break;
    }
  }
  await writeQueue(queue);
  return { sent, remaining: queue.length };
}

export async function pendingCount(): Promise<number> {
  return (await readQueue()).length;
}
