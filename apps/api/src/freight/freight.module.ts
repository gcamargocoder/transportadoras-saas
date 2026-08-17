import { Module } from '@nestjs/common';
import { TripRevenuesModule } from '../trip-revenues/trip-revenues.module';
import { TripSettlementsModule } from '../trip-settlements/trip-settlements.module';
import { ContractsController } from './controllers/contracts.controller';
import { FreightDashboardController } from './controllers/freight-dashboard.controller';
import { FreightPricingController } from './controllers/freight-pricing.controller';
import { FreightRulesController } from './controllers/freight-rules.controller';
import { FreightTablesController } from './controllers/freight-tables.controller';
import { ContractsService } from './services/contracts.service';
import { FreightDashboardService } from './services/freight-dashboard.service';
import { FreightPricingService } from './services/freight-pricing.service';
import { FreightRulesService } from './services/freight-rules.service';
import { FreightTablesService } from './services/freight-tables.service';

@Module({
  imports: [TripRevenuesModule, TripSettlementsModule],
  controllers: [
    ContractsController,
    FreightTablesController,
    FreightRulesController,
    FreightPricingController,
    FreightDashboardController,
  ],
  providers: [ContractsService, FreightTablesService, FreightRulesService, FreightPricingService, FreightDashboardService],
  exports: [ContractsService, FreightTablesService, FreightRulesService, FreightPricingService],
})
export class FreightModule {}
