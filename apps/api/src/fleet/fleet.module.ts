import { Module } from '@nestjs/common';
import { FleetsController } from './controllers/fleets.controller';
import { TagProvidersController } from './controllers/tag-providers.controller';
import { TrailersController } from './controllers/trailers.controller';
import { TripCompositionsController } from './controllers/trip-compositions.controller';
import { VehiclesController } from './controllers/vehicles.controller';
import { FleetsService } from './services/fleets.service';
import { TagProvidersService } from './services/tag-providers.service';
import { TrailersService } from './services/trailers.service';
import { TripCompositionsService } from './services/trip-compositions.service';
import { VehicleTagsService } from './services/vehicle-tags.service';
import { VehiclesService } from './services/vehicles.service';

@Module({
  controllers: [
    FleetsController,
    VehiclesController,
    TrailersController,
    TagProvidersController,
    TripCompositionsController,
  ],
  providers: [
    FleetsService,
    VehiclesService,
    VehicleTagsService,
    TrailersService,
    TagProvidersService,
    TripCompositionsService,
  ],
})
export class FleetModule {}
