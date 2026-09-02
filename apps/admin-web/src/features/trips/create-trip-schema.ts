import { z } from 'zod';

export const createTripSchema = z.object({
  customerId: z.union([z.string().uuid(), z.literal('')]).optional(),
  originLocationId: z.string().uuid('Selecione a origem.'),
  destinationLocationId: z.string().uuid('Selecione o destino.'),
  driverId: z.string().uuid('Selecione o motorista.'),
  compositionId: z.string().uuid('Selecione a composição (veículo + carretas).'),
  tollRouteId: z.union([z.string().uuid(), z.literal('')]).optional(),
  plannedDeparture: z.string().min(1, 'Informe a data/hora de saída prevista.'),
  plannedArrival: z.string().min(1, 'Informe a data/hora de chegada prevista.'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  notes: z.string().optional(),
  // Fase D -- vínculo explícito ida → retorno (opcional) e intenção de carga
  // do planejamento (opcional). Nunca substituem loadStatus (valor real da
  // largada, informado pelo motorista).
  previousTripId: z.union([z.string().uuid(), z.literal('')]).optional(),
  plannedLoadStatus: z.union([z.enum(['LOADED', 'EMPTY']), z.literal('')]).optional(),
});

export type CreateTripFormValues = z.infer<typeof createTripSchema>;
