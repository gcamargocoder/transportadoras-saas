import { ConflictException } from '@nestjs/common';

// Fase 88 -- "planejamento ainda permitido": uma vez que a viagem partiu de
// fato (actualDeparture setado, mesmo sinal usado em todo o sistema -- ver
// TripCompositionsService.assertCompositionNotLocked) ou foi cancelada, o
// PLANEJAMENTO das paradas de entrega fica congelado. Extraido de
// TripDeliveryStopsService para ser reaproveitado pela Fase 89 (aplicar uma
// sugestao de roteirizacao e, no fundo, uma reordenacao de paradas -- a
// MESMA trava, nunca uma segunda regra escrita em outro lugar).
export function assertTripPlanningAllowed(trip: { status: string; actualDeparture: Date | null }): void {
  if (trip.status === 'CANCELLED') {
    throw new ConflictException(
      'Nao e possivel alterar as paradas de entrega: a viagem esta cancelada.',
    );
  }
  if (trip.actualDeparture) {
    throw new ConflictException(
      'Nao e possivel alterar as paradas de entrega: a viagem ja partiu (planejamento encerrado).',
    );
  }
}
