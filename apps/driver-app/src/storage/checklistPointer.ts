import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChecklistType } from '../api/driverChecklist.types';

// Fase 39, secao 42 -- ponteiro leve para recuperar uma execucao de
// checklist em andamento apos o app fechar/reabrir. Guarda so o essencial
// (nunca respostas/estado do formulario): a fonte de verdade real e sempre
// o servidor (GET driver/checklists/:id, ver ChecklistExecutionScreen),
// nunca uma reconstrucao local complexa. Chave separada da syncQueue
// (dominios diferentes -- fila de acoes vs. "existe uma execucao aberta").
export interface ChecklistPointer {
  tripId: string;
  type: ChecklistType;
  executionId: string;
  templateId: string;
}

function storageKey(tripId: string, type: ChecklistType): string {
  return `driverapp.activeChecklist.${tripId}.${type}`;
}

export async function getActiveChecklistPointer(
  tripId: string,
  type: ChecklistType,
): Promise<ChecklistPointer | null> {
  const raw = await AsyncStorage.getItem(storageKey(tripId, type));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChecklistPointer;
  } catch {
    return null;
  }
}

export async function setActiveChecklistPointer(pointer: ChecklistPointer): Promise<void> {
  await AsyncStorage.setItem(storageKey(pointer.tripId, pointer.type), JSON.stringify(pointer));
}

export async function clearActiveChecklistPointer(tripId: string, type: ChecklistType): Promise<void> {
  await AsyncStorage.removeItem(storageKey(tripId, type));
}
