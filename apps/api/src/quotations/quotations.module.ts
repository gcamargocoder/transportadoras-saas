import { Module } from '@nestjs/common';
import { FreightModule } from '../freight/freight.module';
import { TripsModule } from '../trips/trips.module';
import { QuotationsController } from './controllers/quotations.controller';
import { QuotationsService } from './services/quotations.service';

// Fase 94 -- importa FreightModule (FreightPricingService.simulate --
// motor de precificacao existente, nunca duplicado) e TripsModule
// (TripsService.create -- conversao em viagem, nunca uma segunda logica de
// criacao). Nenhuma dependencia circular: nem FreightModule nem TripsModule
// importam QuotationsModule ou um ao outro.
@Module({
  imports: [FreightModule, TripsModule],
  controllers: [QuotationsController],
  providers: [QuotationsService],
})
export class QuotationsModule {}
