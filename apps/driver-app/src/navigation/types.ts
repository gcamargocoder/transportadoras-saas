import { ChecklistTemplate, ChecklistType } from '../api/driverChecklist.types';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  StartTrip: { tripId: string };
  FinishTrip: { tripId: string };
  Fuel: { tripId: string };
  Toll: { tripId: string };
  Stops: { tripId: string };
  // Fase 56 -- comprovante de entrega.
  DeliveryProof: { tripId: string };
  // Fase 39 -- tela de selecao/criacao (lista templates PUBLISHED do tipo
  // pedido, cria ou retoma a execucao).
  Checklist: { tripId: string; type: ChecklistType };
  // template completo (sections/items) ja vem da propria lista de
  // templates disponiveis (GET driver/checklists/available) -- nunca um
  // segundo GET por template, ver decisao 6 do plano da Fase 39.
  ChecklistExecution: { tripId: string; type: ChecklistType; executionId: string; template: ChecklistTemplate };
};
