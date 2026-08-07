import { z } from 'zod';

export const createTripSchema = z.object({
  customerId: z.union([z.string().uuid(), z.literal('')]).optional(),
  originLocationId: z.string().uuid('Selecione a origem.'),
  destinationLocationId: z.string().uuid('Selecione o destino.'),
  driverId: z.string().uuid('Selecione o motorista.'),
  compositionId: z.string().uuid('Selecione a composição (veículo + carretas).'),
  plannedDeparture: z.string().min(1, 'Informe a data/hora de saída prevista.'),
  plannedArrival: z.string().min(1, 'Informe a data/hora de chegada prevista.'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  notes: z.string().optional(),
});

export type CreateTripFormValues = z.infer<typeof createTripSchema>;
