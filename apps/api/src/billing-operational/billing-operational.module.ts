import { Module } from '@nestjs/common';
import { TripRevenuesModule } from '../trip-revenues/trip-revenues.module';
import { BillingController } from './controllers/billing.controller';
import { TripBillingController } from './controllers/trip-billing.controller';
import { BillingDashboardService } from './services/billing-dashboard.service';
import { BillingListService } from './services/billing-list.service';
import { TripBillingService } from './services/trip-billing.service';

@Module({
  imports: [TripRevenuesModule],
  controllers: [TripBillingController, BillingController],
  providers: [TripBillingService, BillingListService, BillingDashboardService],
  exports: [TripBillingService],
})
export class BillingOperationalModule {}
