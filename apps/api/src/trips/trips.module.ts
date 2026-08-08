import { Module } from '@nestjs/common';
import { TollRoutesModule } from '../toll-routes/toll-routes.module';
import { TripExpensesModule } from '../trip-expenses/trip-expenses.module';
import { TripSettlementsModule } from '../trip-settlements/trip-settlements.module';
import { CustomersController } from './controllers/customers.controller';
import { LocationsController } from './controllers/locations.controller';
import { TripsController } from './controllers/trips.controller';
import { CustomersService } from './services/customers.service';
import { LocationsService } from './services/locations.service';
import { RouteEventsService } from './services/route-events.service';
import { RouteVersionsService } from './services/route-versions.service';
import { TripMetricsService } from './services/trip-metrics.service';
import { TripsService } from './services/trips.service';

@Module({
  imports: [TripExpensesModule, TripSettlementsModule, TollRoutesModule],
  controllers: [TripsController, CustomersController, LocationsController],
  providers: [
    TripsService,
    RouteVersionsService,
    RouteEventsService,
    TripMetricsService,
    CustomersService,
    LocationsService,
  ],
})
export class TripsModule {}
