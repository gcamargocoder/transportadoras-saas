import { Module } from '@nestjs/common';
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
