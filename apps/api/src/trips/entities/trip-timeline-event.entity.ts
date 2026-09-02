import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaEntity } from '../../common/entities/pagination-meta.entity';

// Fase 67 -- origem de cada item da timeline unificada. So os valores
// realmente necessarios para o filtro/agrupamento pedido (secao 3): cada um
// corresponde a uma tabela real ja existente, nunca uma segunda fonte de
// verdade. DELIVERY_PROOF e um subconjunto de FiscalDocument (documentType
// = DELIVERY_PROOF) com origem propria por ser o unico com uma secao visual
// dedicada na pagina da viagem (aba "Entrega"). Sem um valor TRIP separado
// de AUDIT: todo evento de ciclo de vida da viagem (criada, iniciada,
// pausada...) ja vem do MESMO AuditLog, uma distincao TRIP/AUDIT nao
// corresponderia a nenhuma fonte de dado real diferente.
export type TripTimelineOrigin =
  | 'STOP'
  | 'ROUTE_EVENT'
  | 'FUEL'
  | 'TOLL'
  | 'AXLE'
  | 'CHECKLIST'
  | 'FISCAL'
  | 'DELIVERY_PROOF'
  | 'EXPENSE'
  | 'REVENUE'
  | 'OCCURRENCE'
  // Fase B -- VehicleIdlePeriod (periodo ocioso persistido) aberto por esta
  // viagem ao concluir (tripBeforeId) e/ou fechado por esta viagem ao
  // iniciar (tripAfterId). Nunca uma segunda fonte de verdade -- so mais uma
  // origem agregada na MESMA projecao em memoria.
  | 'IDLE_PERIOD'
  | 'AUDIT';

export const TRIP_TIMELINE_ORIGINS: TripTimelineOrigin[] = [
  'STOP',
  'ROUTE_EVENT',
  'FUEL',
  'TOLL',
  'AXLE',
  'CHECKLIST',
  'FISCAL',
  'DELIVERY_PROOF',
  'EXPENSE',
  'REVENUE',
  'OCCURRENCE',
  'IDLE_PERIOD',
  'AUDIT',
];

// Projecao/agregacao pura de eventos ja existentes em outras tabelas
// (TripStop, RouteEvent, FuelSupply, TollTransaction, AxleEvent,
// ChecklistExecution, FiscalDocument, TripExpense, TripRevenue,
// TripOccurrence, AuditLog) -- nunca persistida, nunca uma segunda fonte de
// verdade. occurredAt e SEMPRE um timestamp real do registro de origem,
// nunca inventado.
export class TripTimelineEventEntity {
  @ApiProperty({ format: 'uuid', description: 'Id do registro de origem (TripStop.id, RouteEvent.id, etc).' })
  id!: string;

  @ApiProperty({ enum: TRIP_TIMELINE_ORIGINS })
  origin!: TripTimelineOrigin;

  @ApiProperty({ nullable: true, description: 'Subtipo bruto do registro de origem (ex: TripStopType, RouteEventType), quando existir.' })
  type!: string | null;

  @ApiProperty({ description: 'Rotulo legivel em portugues.' })
  label!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ nullable: true, description: 'Preenchido somente para origin=OCCURRENCE.' })
  severity!: string | null;

  @ApiProperty()
  occurredAt!: Date;
}

export class PaginatedTripTimelineEntity {
  @ApiProperty({ type: [TripTimelineEventEntity] })
  items!: TripTimelineEventEntity[];

  @ApiProperty({ type: PaginationMetaEntity })
  meta!: PaginationMetaEntity;
}
